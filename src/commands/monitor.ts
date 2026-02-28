import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import chalk from 'chalk'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName, formatTimestamp } from '../utils.js'
import { sessionExists, listPanes, capturePaneContent, sleepMs } from '../tmux.js'

/**
 * Monitor configuration options
 */
interface MonitorOptions {
  interval?: number
  cwd?: string
  notify?: 'desktop' | 'log' | 'both'
}

/**
 * Heartbeat log entry
 */
interface HeartbeatEntry {
  timestamp: string
  sessionName: string
  paneId: string
  state: string
  contentHash: string
  alert?: string
  details?: string
}

/**
 * Pane tracking state for detecting stuck runners
 */
interface PaneTracker {
  paneId: string
  contentHash: string
  lastChangeTime: number
  consecutiveNoChange: number
  lastState: string
  isResponsive: boolean
}

// State detection patterns (from watch.ts)
const WORKING_INDICATORS = [
  'proofing', 'mustering', 'thinking', 'working', 'processing',
  'analyzing', 'generating', '⌛', '⏳', '⠋', '⠙', '⠹', '⠸',
  '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'
]

const ERROR_PATTERNS = ['error', 'exception', 'failed', 'traceback']

/**
 * Calculate simple hash of content for change detection
 */
function hashContent(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(16)
}

/**
 * Detect runner state from content
 */
function detectState(content: string): string {
  const lines = content.split('\n')
  const lastLines = lines.slice(-20).join('\n').toLowerCase()

  if (ERROR_PATTERNS.some(pattern => lastLines.includes(pattern))) {
    return 'error'
  }

  if (
    lastLines.includes('enter to select') ||
    lastLines.includes('tab/arrow keys to navigate') ||
    /❯\s*\d+\./.test(lastLines)
  ) {
    return 'question'
  }

  if (WORKING_INDICATORS.some(indicator => lastLines.includes(indicator))) {
    return 'working'
  }

  if (lastLines.includes('❯') && !lastLines.match(/[⌛⏳⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)) {
    return 'idle'
  }

  if (lastLines.includes('$') || lastLines.includes('bash') || lastLines.includes('zsh')) {
    return 'stopped'
  }

  return 'unknown'
}

/**
 * Send desktop notification
 */
function sendDesktopNotification(title: string, message: string): void {
  try {
    spawn('notify-send', [title, message], { detached: true })
  } catch {
    console.log(chalk.yellow(`🔔 ${title}: ${message}`))
  }
}

/**
 * Send notification based on configured method
 */
function sendNotification(
  notifyMethod: 'desktop' | 'log' | 'both',
  logFile: string,
  title: string,
  message: string
): void {
  if (notifyMethod === 'desktop' || notifyMethod === 'both') {
    sendDesktopNotification(title, message)
  }

  if (notifyMethod === 'log' || notifyMethod === 'both') {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ALERT: ${title}: ${message}\n`
    try {
      fs.appendFileSync(logFile, logEntry)
    } catch (err) {
      console.error(chalk.red(`Failed to write to log file: ${err}`))
    }
  }
}

/**
 * Write heartbeat entry to log
 */
function writeHeartbeatLog(logFile: string, entry: HeartbeatEntry): void {
  const logLine = JSON.stringify(entry) + '\n'
  try {
    fs.appendFileSync(logFile, logLine)
  } catch (err) {
    console.error(chalk.red(`Failed to write heartbeat log: ${err}`))
  }
}

/**
 * Initialize heartbeat log file with header
 */
function initHeartbeatLog(logFile: string): void {
  const header = `# Crewpilot Heartbeat Log\n# Started: ${new Date().toISOString()}\n# Format: JSON lines\n\n`
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, header)
    }
  } catch (err) {
    console.error(chalk.red(`Failed to initialize heartbeat log: ${err}`))
  }
}

/**
 * Detect if pane is truly stuck (not just slow)
 * Uses multiple criteria: content changes, working indicators, and time-based heuristics
 */
function detectStuckRunner(
  tracker: PaneTracker,
  currentState: string,
  intervalMs: number
): { isStuck: boolean; reason: string } {
  // If pane is not working state, it's not "stuck" in the problematic sense
  if (currentState !== 'working') {
    return { isStuck: false, reason: '' }
  }

  // Content hasn't changed
  if (tracker.consecutiveNoChange >= 3) {
    // No change for 3 consecutive checks (90 seconds default)
    const stuckDuration = tracker.consecutiveNoChange * (intervalMs / 1000)
    return {
      isStuck: true,
      reason: `No visual progress for ${stuckDuration}s while in working state`
    }
  }

  // Extended working state without progress
  if (tracker.consecutiveNoChange >= 6) {
    const stuckDuration = tracker.consecutiveNoChange * (intervalMs / 1000)
    return {
      isStuck: true,
      reason: `Runner appears frozen - no output change for ${stuckDuration}s`
    }
  }

  return { isStuck: false, reason: '' }
}

/**
 * Detect if runner is dead (pane exists but no Claude Code activity)
 */
function detectDeadRunner(currentState: string, content: string): { isDead: boolean; reason: string } {
  // Check for shell prompt without Claude Code
  if (currentState === 'stopped') {
    // Verify it's actually a shell and not just a temporary state
    const lines = content.split('\n')
    const lastFewLines = lines.slice(-5).join('\n')

    // Look for shell prompt patterns without Claude indicators
    if (
      (lastFewLines.includes('$') || lastFewLines.includes('>')) &&
      !lastFewLines.includes('❯') &&
      !lastFewLines.includes('claude')
    ) {
      return { isDead: true, reason: 'Pane shows shell prompt - Claude Code may have crashed' }
    }
  }

  // Check for completely empty or static content
  if (content.trim().length < 10) {
    return { isDead: true, reason: 'Pane content nearly empty - possible crash' }
  }

  return { isDead: false, reason: '' }
}

/**
 * Run the heartbeat monitor
 */
export async function runMonitor(options: MonitorOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  const intervalSeconds = options.interval ?? 30
  const intervalMs = intervalSeconds * 1000
  const notifyMethod = options.notify ?? 'both'

  if (!teamConfigExists(cwd)) {
    console.log(chalk.red(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`))
    process.exit(1)
  }

  // Get project info
  let projectName: string
  try {
    const userContext = fs.readFileSync(path.join(cwd, '.team-config', 'USER-CONTEXT.md'), 'utf-8')
    projectName = getProjectName(userContext) ?? path.basename(cwd)
  } catch {
    projectName = path.basename(cwd)
  }

  const sessionName = getSessionName(projectName)
  const logFile = path.join(cwd, '.team-config', 'heartbeat.log')

  // Initialize log file
  initHeartbeatLog(logFile)

  console.log(chalk.bold(`\n── Crewpilot Monitor ──\n`))
  console.log(chalk.gray(`Project: ${projectName}`))
  console.log(chalk.gray(`Session: ${sessionName}`))
  console.log(chalk.gray(`Check interval: ${intervalSeconds}s`))
  console.log(chalk.gray(`Log file: ${logFile}`))
  console.log(chalk.gray(`\nPress Ctrl+C to stop monitoring\n`))

  // Track pane states for stuck detection
  const paneTrackers = new Map<string, PaneTracker>()

  // Track alerts to avoid spamming
  const stuckAlerts = new Set<string>()
  const deadAlerts = new Set<string>()

  // Write startup entry
  writeHeartbeatLog(logFile, {
    timestamp: new Date().toISOString(),
    sessionName,
    paneId: 'monitor',
    state: 'started',
    contentHash: '',
    details: `Monitoring started with ${intervalSeconds}s interval`
  })

  // Main monitoring loop
  while (true) {
    try {
      const timestamp = new Date()

      // Check if session exists
      if (!sessionExists(sessionName)) {
        console.log(chalk.yellow(`[${formatTimestamp(timestamp)}] Session "${sessionName}" not active`))

        writeHeartbeatLog(logFile, {
          timestamp: timestamp.toISOString(),
          sessionName,
          paneId: 'monitor',
          state: 'no_session',
          contentHash: '',
          alert: 'Session not active'
        })

        sleepMs(intervalMs)
        continue
      }

      // Get all panes
      const panes = listPanes(sessionName)

      if (panes.length === 0) {
        console.log(chalk.yellow(`[${formatTimestamp(timestamp)}] No panes found in session`))
        sleepMs(intervalMs)
        continue
      }

      // Check each pane
      for (const pane of panes) {
        const content = capturePaneContent(pane.id, 50)
        const contentHash = hashContent(content)
        const state = detectState(content)

        // Get or create tracker for this pane
        let tracker = paneTrackers.get(pane.id)

        if (!tracker) {
          tracker = {
            paneId: pane.id,
            contentHash,
            lastChangeTime: Date.now(),
            consecutiveNoChange: 0,
            lastState: state,
            isResponsive: true
          }
          paneTrackers.set(pane.id, tracker)
        }

        // Check if content changed
        if (tracker.contentHash === contentHash) {
          tracker.consecutiveNoChange++
        } else {
          tracker.contentHash = contentHash
          tracker.lastChangeTime = Date.now()
          tracker.consecutiveNoChange = 0
          tracker.isResponsive = true
          tracker.lastState = state

          // Clear alerts if pane recovers
          if (stuckAlerts.has(pane.id)) {
            stuckAlerts.delete(pane.id)
            console.log(chalk.green(`[${formatTimestamp(timestamp)}] ${pane.id} recovered from stuck state`))
          }
          if (deadAlerts.has(pane.id)) {
            deadAlerts.delete(pane.id)
            console.log(chalk.green(`[${formatTimestamp(timestamp)}] ${pane.id} recovered from dead state`))
          }
        }

        // Detect stuck runner
        const stuckDetection = detectStuckRunner(tracker, state, intervalMs)
        if (stuckDetection.isStuck && !stuckAlerts.has(pane.id)) {
          const alertMsg = `Runner ${pane.id} appears stuck: ${stuckDetection.reason}`
          console.log(chalk.red(`[${formatTimestamp(timestamp)}] ⚠️ ${alertMsg}`))

          sendNotification(notifyMethod, logFile, 'Crewpilot: Stuck Runner', alertMsg)

          writeHeartbeatLog(logFile, {
            timestamp: timestamp.toISOString(),
            sessionName,
            paneId: pane.id,
            state,
            contentHash,
            alert: 'stuck',
            details: stuckDetection.reason
          })

          stuckAlerts.add(pane.id)
        }

        // Detect dead runner
        const deadDetection = detectDeadRunner(state, content)
        if (deadDetection.isDead && !deadAlerts.has(pane.id)) {
          const alertMsg = `Runner ${pane.id} appears dead: ${deadDetection.reason}`
          console.log(chalk.red(`[${formatTimestamp(timestamp)}] 💀 ${alertMsg}`))

          sendNotification(notifyMethod, logFile, 'Crewpilot: Dead Runner', alertMsg)

          writeHeartbeatLog(logFile, {
            timestamp: timestamp.toISOString(),
            sessionName,
            paneId: pane.id,
            state,
            contentHash,
            alert: 'dead',
            details: deadDetection.reason
          })

          deadAlerts.add(pane.id)
        }

        // Log normal heartbeat (every 10 checks or on state change)
        if (tracker.consecutiveNoChange === 0 || tracker.consecutiveNoChange % 10 === 0) {
          writeHeartbeatLog(logFile, {
            timestamp: timestamp.toISOString(),
            sessionName,
            paneId: pane.id,
            state,
            contentHash
          })
        }

        // Console output for current state
        const stateIcon = {
          working: chalk.blue('●'),
          idle: chalk.yellow('○'),
          question: chalk.magenta('?'),
          error: chalk.red('✖'),
          stopped: chalk.gray('■'),
          unknown: chalk.gray('?')
        }[state]

        const changeIndicator = tracker.consecutiveNoChange > 0
          ? chalk.gray(` (${tracker.consecutiveNoChange}x no change)`)
          : ''

        console.log(`[${formatTimestamp(timestamp)}] ${stateIcon} ${pane.id}: ${state}${changeIndicator}`)
      }

      // Clean up trackers for removed panes
      const currentPaneIds = new Set(panes.map(p => p.id))
      for (const [paneId] of paneTrackers) {
        if (!currentPaneIds.has(paneId)) {
          paneTrackers.delete(paneId)
          stuckAlerts.delete(paneId)
          deadAlerts.delete(paneId)
        }
      }

      sleepMs(intervalMs)

    } catch (err) {
      console.error(chalk.red(`[${formatTimestamp(new Date())}] Error: ${err}`))

      writeHeartbeatLog(logFile, {
        timestamp: new Date().toISOString(),
        sessionName,
        paneId: 'monitor',
        state: 'error',
        contentHash: '',
        alert: 'monitor_error',
        details: String(err)
      })

      sleepMs(intervalMs)
    }
  }
}
