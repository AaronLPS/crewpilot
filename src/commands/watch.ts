import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import chalk from 'chalk'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName } from '../utils.js'
import {
  sessionExists,
  listPanes,
  capturePaneContent,
  sleepMs,
} from '../tmux.js'

/**
 * Runner state detection result
 */
interface RunnerState {
  paneId: string
  state: 'working' | 'idle' | 'question' | 'error' | 'stopped' | 'unknown'
  details?: string
  lastActivity: Date
  idleDurationMs?: number
  confidence: number // 0-1 confidence in state detection
  rawContent: string // Raw captured pane content for state file writing
}

/**
 * Detected question from runner pane content
 */
interface DetectedQuestion {
  text: string
  options: string[]
  type: 'multiple_choice' | 'free_text'
}

/**
 * State file written to .team-config/runner-state.json
 */
interface RunnerStateFile {
  paneId: string
  state: RunnerState['state']
  confidence: number
  timestamp: string
  idleSince: string | null
  capturedContent: string
  detectedQuestion: DetectedQuestion | null
  details: string | undefined
}

/**
 * Watch configuration
 */
interface WatchConfig {
  pollIntervalMs: number
  idleThresholdMs: number
  notificationMethod: 'desktop' | 'log' | 'both'
  logFile?: string
  rateLimitMs: number
}

/**
 * Detected platform type for notifications
 */
type Platform = 'linux' | 'macos' | 'windows' | 'unknown'

function detectPlatform(): Platform {
  const platform = os.platform()
  if (platform === 'linux') return 'linux'
  if (platform === 'darwin') return 'macos'
  if (platform === 'win32') return 'windows'
  return 'unknown'
}

/**
 * Get notification command for current platform
 */
function getNotificationCommand(platform: Platform): { command: string; args: string[] } | null {
  switch (platform) {
    case 'linux':
      // Check if notify-send is available
      try {
        execFileSync('which', ['notify-send'], { stdio: 'pipe' })
        return { command: 'notify-send', args: [] }
      } catch {
        return null
      }
    case 'macos':
      // macOS has osascript built-in
      return { command: 'osascript', args: ['-e'] }
    case 'windows':
      // Windows has PowerShell
      return { command: 'powershell', args: ['-Command'] }
    default:
      return null
  }
}

/**
 * Send desktop notification (cross-platform)
 */
function sendDesktopNotification(title: string, message: string): boolean {
  const platform = detectPlatform()
  const notificationCmd = getNotificationCommand(platform)
  
  if (!notificationCmd) {
    // Fallback to console
    console.log(chalk.yellow(`🔔 ${title}: ${message}`))
    return false
  }
  
  try {
    switch (platform) {
      case 'linux': {
        spawn(notificationCmd.command, [...notificationCmd.args, title, message], { 
          detached: true,
          stdio: 'ignore'
        }).unref()
        return true
      }
      case 'macos': {
        const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`
        spawn(notificationCmd.command, [...notificationCmd.args, script], {
          detached: true,
          stdio: 'ignore'
        }).unref()
        return true
      }
      case 'windows': {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.MessageBox]::Show('${message.replace(/'/g, "''")}', '${title.replace(/'/g, "''")}', 'OK', 'Information')
        `
        // For Windows, use a non-blocking notification via PowerShell
        const simplerScript = `New-BurntToastNotification -Text '${title.replace(/'/g, "''")}', '${message.replace(/'/g, "''")}' -ErrorAction SilentlyContinue`
        spawn(notificationCmd.command, [...notificationCmd.args, simplerScript], {
          detached: true,
          stdio: 'ignore'
        }).unref()
        return true
      }
      default:
        return false
    }
  } catch {
    console.log(chalk.yellow(`🔔 ${title}: ${message}`))
    return false
  }
}

/**
 * Log notification to file with rotation consideration
 */
function logNotification(logFile: string, title: string, message: string): void {
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] ${title}: ${message}\n`
  
  try {
    // Ensure directory exists
    const dir = path.dirname(logFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.appendFileSync(logFile, logEntry)
  } catch (err) {
    console.error(chalk.red(`Failed to write to log file: ${err}`))
  }
}

/**
 * Send notification based on configured method with rate limiting
 */
class NotificationManager {
  private lastNotificationTime = new Map<string, number>()
  private config: WatchConfig

  constructor(config: WatchConfig) {
    this.config = config
  }

  async send(title: string, message: string, key: string): Promise<void> {
    const now = Date.now()
    const lastTime = this.lastNotificationTime.get(key) ?? 0
    
    // Rate limiting
    if (now - lastTime < this.config.rateLimitMs) {
      return
    }
    
    this.lastNotificationTime.set(key, now)

    if (this.config.notificationMethod === 'desktop' || this.config.notificationMethod === 'both') {
      sendDesktopNotification(title, message)
    }
    
    if ((this.config.notificationMethod === 'log' || this.config.notificationMethod === 'both') && this.config.logFile) {
      logNotification(this.config.logFile, title, message)
    }
  }

  clearStaleEntries(maxAgeMs: number): void {
    const now = Date.now()
    for (const [key, time] of this.lastNotificationTime.entries()) {
      if (now - time > maxAgeMs) {
        this.lastNotificationTime.delete(key)
      }
    }
  }
}

/**
 * Detect runner state from captured pane content with confidence scoring
 */
function detectState(content: string, previousContent?: string): { state: RunnerState['state']; confidence: number; details?: string } {
  const lines = content.split('\n').filter(l => l.trim())
  const lastLines = lines.slice(-30).join('\n').toLowerCase()
  const lastFewLines = lines.slice(-5)
  
  let confidence = 0.5 // Base confidence
  let detectedState: RunnerState['state'] = 'unknown'
  let details: string | undefined

  // Check for error indicators (high priority)
  const errorPatterns = [
    /\berror\b/i,
    /\bexception\b/i,
    /\bfailed\b/i,
    /\btraceback\b/i,
    /\bundefined\b.*\berror\b/i,
    /\bsyntaxerror\b/i,
    /\buncaught\b/i,
  ]
  
  const errorMatches = errorPatterns.filter(p => p.test(lastLines)).length
  if (errorMatches >= 2 || (errorMatches >= 1 && /traceback/i.test(lastLines))) {
    confidence = 0.9 + (errorMatches * 0.02)
    detectedState = 'error'
    details = extractLastMeaningfulLine(lastFewLines)
    return { state: detectedState, confidence: Math.min(confidence, 1), details }
  }

  // Check for AskUserQuestion pattern (high priority)
  const questionPatterns = [
    /enter to select/i,
    /tab\/arrow keys to navigate/i,
    /use arrow keys/i,
    /❯\s*\d+\./,
    /\?\s*.+\s*\[.*\]/, // Prompt with choices like ? What to do? [Yes/No]
    /\(\d+\/\d+\)/, // Progress indicator with choices
  ]
  
  const questionMatches = questionPatterns.filter(p => p.test(lastLines)).length
  if (questionMatches >= 1) {
    confidence = 0.85 + (questionMatches * 0.05)
    detectedState = 'question'
    details = extractLastMeaningfulLine(lastFewLines)
    return { state: detectedState, confidence: Math.min(confidence, 1), details }
  }

  // Check for working indicators (spinners, progress text)
  const workingIndicators = [
    'proofing', 'mustering', 'thinking', 'working', 'processing',
    'analyzing', 'generating', 'loading', 'compiling', 'building',
    'installing', 'downloading', 'searching', 'indexing',
  ]
  
  const spinnerChars = ['⌛', '⏳', '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', '◐', '◓', '◑', '◒']
  
  const hasSpinner = spinnerChars.some(c => lastLines.includes(c))
  const hasWorkingText = workingIndicators.some(w => lastLines.includes(w))
  
  if (hasSpinner || hasWorkingText) {
    confidence = 0.8 + (hasSpinner ? 0.1 : 0) + (hasWorkingText ? 0.05 : 0)
    detectedState = 'working'
    details = extractLastMeaningfulLine(lastFewLines)
    return { state: detectedState, confidence: Math.min(confidence, 1), details }
  }

  // Check for progress indicators
  const progressPatterns = [
    /\d+%/,
    /\[\s*#+\s*\]/,
    /progress/i,
    /completed?\s*\d+\s*\/\s*\d+/i,
  ]
  
  if (progressPatterns.some(p => p.test(lastLines))) {
    confidence = 0.75
    detectedState = 'working'
    details = extractLastMeaningfulLine(lastFewLines)
    return { state: detectedState, confidence, details }
  }

  // Check for idle prompt
  const hasPrompt = /❯/.test(lastLines)
  const noSpinner = !spinnerChars.some(c => lastLines.includes(c))
  
  if (hasPrompt && noSpinner) {
    confidence = 0.85
    detectedState = 'idle'
    details = extractLastMeaningfulLine(lastFewLines)
    return { state: detectedState, confidence, details }
  }

  // Check if pane shows shell prompt (stopped)
  // More specific patterns to avoid false positives
  const shellPatterns = [
    /^\$\s/,          // $ at start
    /^bash-[\d.]+\$/, // bash-5.1$
    /^\w+@\w+:[\/\w\s~]+[$#]/, // user@host:~/path$
    /^zsh\s*\$/,      // zsh $
    /^sh\s*\$/,       // sh $
  ]
  
  const lastLine = lastFewLines[lastFewLines.length - 1] || ''
  const isShellPrompt = shellPatterns.some(p => p.test(lastLine))
  
  if (isShellPrompt) {
    confidence = 0.8
    detectedState = 'stopped'
    details = 'Shell prompt detected'
    return { state: detectedState, confidence, details }
  }

  // Default to idle if we see any prompt-like character but no activity
  if (lastLines.includes('>') || lastLines.includes('$')) {
    confidence = 0.6
    detectedState = 'idle'
    return { state: detectedState, confidence, details: extractLastMeaningfulLine(lastFewLines) }
  }

  // Unknown state
  confidence = 0.3
  detectedState = 'unknown'
  details = extractLastMeaningfulLine(lastFewLines)
  return { state: detectedState, confidence, details }
}

/**
 * Extract the last meaningful line from pane content
 */
function extractLastMeaningfulLine(lines: string[]): string {
  // Filter out empty lines and very short lines
  const meaningful = lines.filter(l => l.trim().length > 2)
  if (meaningful.length === 0) return ''
  
  const lastLine = meaningful[meaningful.length - 1]
  return lastLine.slice(0, 100) // Limit length
}

/**
 * Extract question text and options from captured pane content
 */
function extractQuestion(content: string): DetectedQuestion | null {
  const lines = content.split('\n')
  const options: string[] = []
  let firstOptionIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const optionMatch = lines[i].match(/^[❯\s]*\d+\.\s+(.+)/)
    if (optionMatch) {
      if (firstOptionIndex === -1) firstOptionIndex = i
      options.push(optionMatch[1].trim())
    }
  }

  if (options.length > 0 && firstOptionIndex > 0) {
    // Question text is the line before the first option
    const questionText = lines[firstOptionIndex - 1].trim()
    return {
      text: questionText,
      options,
      type: 'multiple_choice',
    }
  }

  // Check for free-text question patterns
  const questionLine = lines.find(l => l.trim().endsWith('?'))
  if (questionLine) {
    return {
      text: questionLine.trim(),
      options: [],
      type: 'free_text',
    }
  }

  return null
}

/**
 * Write runner state to .team-config/runner-state.json
 */
function writeRunnerState(cwd: string, state: RunnerState, content: string): void {
  const configDir = path.join(cwd, '.team-config')
  const statePath = path.join(configDir, 'runner-state.json')

  let detectedQuestion: DetectedQuestion | null = null
  if (state.state === 'question') {
    detectedQuestion = extractQuestion(content)
  }

  const stateFile: RunnerStateFile = {
    paneId: state.paneId,
    state: state.state,
    confidence: state.confidence,
    timestamp: new Date().toISOString(),
    idleSince: state.idleDurationMs && state.idleDurationMs > 0
      ? new Date(Date.now() - state.idleDurationMs).toISOString()
      : null,
    capturedContent: content,
    detectedQuestion,
    details: state.details,
  }

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    fs.writeFileSync(statePath, JSON.stringify(stateFile, null, 2), 'utf-8')
  } catch {
    // Silently fail - state file writing should not break watch
  }
}

/**
 * Append event to .team-config/runner-events.log
 */
function appendRunnerEvent(cwd: string, event: string, paneId: string): void {
  const configDir = path.join(cwd, '.team-config')
  const eventsPath = path.join(configDir, 'runner-events.log')
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] pane=${paneId} event=${event}\n`

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    fs.appendFileSync(eventsPath, logEntry)
  } catch {
    // Silently fail - event logging should not break watch
  }
}

/**
 * Calculate idle duration by comparing with previous content
 */
function calculateIdleDuration(
  currentContent: string,
  previousContent: string | undefined,
  previousIdleDuration: number,
  timeSinceLastCheck: number
): number {
  if (!previousContent) {
    return 0
  }
  
  // Normalize content for comparison
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  
  if (normalize(currentContent) === normalize(previousContent)) {
    // Content hasn't changed, accumulate idle time
    return previousIdleDuration + timeSinceLastCheck
  }
  
  // Content changed, reset idle time
  return 0
}

/**
 * Get runner state for all panes in a session
 */
function getRunnerStates(
  sessionName: string,
  previousStates: Map<string, RunnerState>,
  pollIntervalMs: number
): RunnerState[] {
  const states: RunnerState[] = []
  let panes: { id: string; active: boolean; command: string }[]
  
  try {
    panes = listPanes(sessionName)
  } catch (err) {
    // Return empty if we can't list panes
    return states
  }

  for (const pane of panes) {
    let content: string
    try {
      content = capturePaneContent(pane.id, 50)
    } catch (err) {
      // Skip panes we can't capture
      continue
    }
    
    const previousState = previousStates.get(pane.id)
    const detection = detectState(content, previousState?.details)
    
    // Calculate idle duration
    let idleDurationMs: number | undefined
    if (detection.state === 'idle' || detection.state === 'unknown') {
      idleDurationMs = calculateIdleDuration(
        content,
        previousState?.details,
        previousState?.idleDurationMs ?? 0,
        pollIntervalMs
      )
    }
    
    states.push({
      paneId: pane.id,
      state: detection.state,
      details: detection.details,
      lastActivity: new Date(),
      idleDurationMs,
      confidence: detection.confidence,
      rawContent: content,
    })
  }

  return states
}

/**
 * Format state for display
 */
function formatState(state: RunnerState): string {
  const stateColors: Record<RunnerState['state'], string> = {
    working: chalk.blue('● Working'),
    idle: chalk.yellow('○ Idle'),
    question: chalk.magenta('? Question'),
    error: chalk.red('✖ Error'),
    stopped: chalk.gray('■ Stopped'),
    unknown: chalk.gray('? Unknown'),
  }
  
  let output = stateColors[state.state]
  
  // Add confidence indicator for low confidence
  if (state.confidence < 0.7) {
    output += chalk.gray(` (~${Math.round(state.confidence * 100)}%)`)
  }
  
  // Add idle duration if relevant
  if (state.idleDurationMs && state.idleDurationMs > 60000) {
    const mins = Math.floor(state.idleDurationMs / 60000)
    output += chalk.gray(` (${mins}m idle)`)
  }
  
  return output
}

interface WatchOptions {
  cwd?: string
  pollInterval?: number
  notify?: 'desktop' | 'log' | 'both'
  logFile?: string
  once?: boolean
  rateLimit?: number // Minutes between same-type notifications
}

/**
 * Run watch mode - monitor runners and notify on important state changes
 */
export async function runWatch(options: WatchOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  const config: WatchConfig = {
    pollIntervalMs: (options.pollInterval ?? 5) * 1000,
    idleThresholdMs: 30000, // 30 seconds
    notificationMethod: options.notify ?? 'desktop',
    logFile: options.logFile ?? path.join(cwd, '.team-config', 'watch-notifications.log'),
    rateLimitMs: (options.rateLimit ?? 5) * 60 * 1000, // Default 5 minutes
  }

  if (!teamConfigExists(cwd)) {
    console.log(chalk.red('✗ No .team-config/ found'))
    console.log(chalk.gray('Run crewpilot init to set up your project first.'))
    return
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

  if (!sessionExists(sessionName)) {
    console.log(chalk.yellow(`⚠ Session "${sessionName}" is not active.`))
    console.log(chalk.gray('Run crewpilot start or crewpilot resume first.'))
    return
  }

  // Show platform info
  const platform = detectPlatform()
  const notificationStatus = getNotificationCommand(platform) 
    ? chalk.green('available')
    : chalk.yellow('unavailable (fallback to console)')

  console.log(chalk.bold(`\n── Crewpilot Watch: ${projectName} ──\n`))
  console.log(chalk.gray(`Session: ${sessionName}`))
  console.log(chalk.gray(`Poll interval: ${config.pollIntervalMs / 1000}s`))
  console.log(chalk.gray(`Notifications: ${config.notificationMethod} (${platform} ${notificationStatus})`))
  console.log(chalk.gray(`Rate limit: ${config.rateLimitMs / 60000}m between same alerts`))
  if (config.logFile) {
    console.log(chalk.gray(`Log file: ${config.logFile}`))
  }
  console.log(chalk.gray('\nPress Ctrl+C to stop watching\n'))

  // Track previous states to detect changes
  let previousStates = new Map<string, RunnerState>()
  const notifiedQuestions = new Set<string>()
  const notificationManager = new NotificationManager(config)
  
  // Initialize log file
  if (config.notificationMethod === 'log' || config.notificationMethod === 'both') {
    try {
      const timestamp = new Date().toISOString()
      fs.appendFileSync(config.logFile, `\n[${timestamp}] Watch started for ${sessionName}\n`)
    } catch (err) {
      console.log(chalk.yellow(`⚠ Could not initialize log file: ${err}`))
    }
  }

  let loopCount = 0
  const MAX_LOOP_COUNT = 1000000 // Safety limit for cleanup

  // Main watch loop
  while (true) {
    try {
      // Periodic cleanup
      loopCount++
      if (loopCount % 100 === 0) {
        notificationManager.clearStaleEntries(24 * 60 * 60 * 1000) // 24 hours
      }
      
      // Safety cleanup to prevent unbounded growth
      if (loopCount > MAX_LOOP_COUNT) {
        notifiedQuestions.clear()
        loopCount = 0
      }

      const states = getRunnerStates(sessionName, previousStates, config.pollIntervalMs)

      // Clear screen and show current status
      console.clear()
      console.log(chalk.bold(`── Crewpilot Watch: ${projectName} ──`))
      console.log(chalk.gray(`Session: ${sessionName} | ${new Date().toLocaleTimeString()}`))
      console.log(chalk.gray(`Platform: ${platform} | Notifications: ${config.notificationMethod}\n`))

      for (const state of states) {
        const prevState = previousStates.get(state.paneId)
        const isNew = prevState === undefined
        const changed = prevState?.state !== state.state

        // Display state
        const changeIndicator = changed ? chalk.yellow(' [CHANGED]') : ''
        console.log(`${formatState(state)} ${chalk.gray(state.paneId)}${changeIndicator}`)
        
        if (state.details) {
          console.log(chalk.gray(`  ${state.details}`))
        }

        // Send notifications for important state changes
        if (changed || isNew) {
          // Question detected - requires human input
          if (state.state === 'question' && !notifiedQuestions.has(state.paneId)) {
            await notificationManager.send(
              'Crewpilot: Input Needed',
              `Runner ${state.paneId} is waiting for your answer`,
              `question-${state.paneId}`
            )
            notifiedQuestions.add(state.paneId)
          }

          // Error detected
          if (state.state === 'error') {
            await notificationManager.send(
              'Crewpilot: Error Detected',
              `Runner ${state.paneId} encountered an error`,
              `error-${state.paneId}`
            )
          }

          // Runner stopped unexpectedly
          if (state.state === 'stopped' && prevState && prevState.state !== 'stopped') {
            await notificationManager.send(
              'Crewpilot: Runner Stopped',
              `Runner ${state.paneId} has stopped`,
              `stopped-${state.paneId}`
            )
          }

          // Question was answered (no longer in question state)
          if (prevState?.state === 'question' && state.state !== 'question') {
            notifiedQuestions.delete(state.paneId)
          }
        }

        // Write state file for each pane
        writeRunnerState(cwd, state, state.rawContent)

        // Append event log on state transitions
        if (changed || isNew) {
          appendRunnerEvent(cwd, state.state, state.paneId)
        }

        previousStates.set(state.paneId, state)
      }

      // Clean up stale pane entries
      const currentPaneIds = new Set(states.map(s => s.paneId))
      for (const paneId of previousStates.keys()) {
        if (!currentPaneIds.has(paneId)) {
          previousStates.delete(paneId)
          notifiedQuestions.delete(paneId)
        }
      }

      if (states.length === 0) {
        console.log(chalk.yellow('⚠ No active panes found in session.'))
      }

      console.log(chalk.gray('\n─'.repeat(40)))
      console.log(chalk.gray('Press Ctrl+C to stop watching'))

      // Exit if --once flag was passed
      if (options.once) {
        break
      }

      // Wait before next poll
      sleepMs(config.pollIntervalMs)

    } catch (err: any) {
      console.error(chalk.red(`\n✗ Error during watch: ${err.message}`))
      
      // Check if session still exists
      if (!sessionExists(sessionName)) {
        console.log(chalk.red('\nSession ended. Stopping watch.'))
        break
      }

      sleepMs(config.pollIntervalMs)
    }
  }
}

/**
 * Quick status check - single poll without continuous watch
 */
export function runCheck(cwd?: string): void {
  const dir = cwd ?? process.cwd()

  if (!teamConfigExists(dir)) {
    console.log(chalk.red('✗ No .team-config/ found'))
    console.log(chalk.gray('Run crewpilot init to set up your project first.'))
    return
  }

  let projectName: string
  try {
    const userContext = fs.readFileSync(path.join(dir, '.team-config', 'USER-CONTEXT.md'), 'utf-8')
    projectName = getProjectName(userContext) ?? path.basename(dir)
  } catch {
    projectName = path.basename(dir)
  }
  
  const sessionName = getSessionName(projectName)

  if (!sessionExists(sessionName)) {
    console.log(chalk.yellow(`⚠ Session "${sessionName}" is not active.`))
    console.log(chalk.gray('Run crewpilot start or crewpilot resume first.'))
    return
  }

  console.log(chalk.bold(`\n── Runner Status ──\n`))
  
  const states = getRunnerStates(sessionName, new Map(), 5000)
  
  for (const state of states) {
    console.log(`${formatState(state)} ${chalk.gray(state.paneId)}`)
    if (state.details) {
      console.log(chalk.gray(`  ${state.details}`))
    }
  }

  if (states.length === 0) {
    console.log(chalk.yellow('⚠ No active panes found.'))
  }

  console.log('')
}
