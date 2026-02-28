import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { confirm, select } from '@inquirer/prompts'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName, formatTimestamp } from '../utils.js'
import {
  sessionExists,
  createSession,
  listPanes,
  sendKeys,
  sendEnter,
  sendTextInput,
  attachSession,
  sleepMs,
} from '../tmux.js'

const RECOVERY_PROMPT = `Read .team-config/session-recovery.md and follow the recovery instructions. Read .team-config/team-lead-persona.md to restore your Team Lead persona. Resume work from where you left off. IMPORTANT: Follow the Session Recovery section of your persona, NOT the Project Startup Workflow. Do not re-run the startup sequence.`

/**
 * Session recovery analysis result
 */
interface RecoveryAnalysis {
  hasStateSnapshot: boolean
  hasSessionRecovery: boolean
  hasGsdProgress: boolean
  snapshotTime?: Date
  lastPhase?: string
  recommendation: 'continue' | 'fresh' | 'review'
  reason: string
  warnings: string[]
  errors: string[]
}

interface ResumeOptions {
  cwd?: string
  fresh?: boolean
  noAttach?: boolean
  auto?: boolean
}

/**
 * Parse date from various formats
 * Tries multiple common formats and returns first valid date
 */
function parseFlexibleDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null
  }
  
  const trimmed = dateStr.trim()
  
  // Try ISO format first (2024-01-15T10:30:00.000Z)
  let parsed = new Date(trimmed)
  if (!isNaN(parsed.getTime())) {
    return parsed
  }
  
  // Try common formats
  const formats = [
    // YYYY-MM-DD HH:MM:SS
    (s: string) => {
      const match = s.match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})/)
      if (match) {
        return new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3]),
          parseInt(match[4]),
          parseInt(match[5]),
          parseInt(match[6])
        )
      }
      return null
    },
    // YYYY-MM-DD
    (s: string) => {
      const match = s.match(/(\d{4})-(\d{2})-(\d{2})/)
      if (match) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
      }
      return null
    },
    // MM/DD/YYYY HH:MM:SS
    (s: string) => {
      const match = s.match(/(\d{2})\/(\d{2})\/(\d{4})[\sT](\d{2}):(\d{2}):?(\d{2})?/)
      if (match) {
        return new Date(
          parseInt(match[3]),
          parseInt(match[1]) - 1,
          parseInt(match[2]),
          parseInt(match[4]),
          parseInt(match[5]),
          parseInt(match[6] || '0')
        )
      }
      return null
    },
    // DD.MM.YYYY HH:MM:SS
    (s: string) => {
      const match = s.match(/(\d{2})\.(\d{2})\.(\d{4})[\sT](\d{2}):(\d{2}):(\d{2})/)
      if (match) {
        return new Date(
          parseInt(match[3]),
          parseInt(match[2]) - 1,
          parseInt(match[1]),
          parseInt(match[4]),
          parseInt(match[5]),
          parseInt(match[6])
        )
      }
      return null
    },
  ]
  
  for (const parseFn of formats) {
    try {
      const result = parseFn(trimmed)
      if (result && !isNaN(result.getTime())) {
        return result
      }
    } catch {
      // Continue to next format
    }
  }
  
  return null
}

/**
 * Safely read and parse state snapshot
 * Returns null if file is corrupted or unreadable
 */
function safelyReadSnapshot(cwd: string): {
  content: string
  snapshotTime?: Date
  lastPhase?: string
  warnings: string[]
} | null {
  const stateSnapshotPath = path.join(cwd, '.team-config', 'state-snapshot.md')
  
  if (!fs.existsSync(stateSnapshotPath)) {
    return null
  }
  
  const result: ReturnType<typeof safelyReadSnapshot> = {
    content: '',
    warnings: [],
  }
  
  try {
    // Check file size (prevent reading huge corrupted files)
    const stats = fs.statSync(stateSnapshotPath)
    if (stats.size > 10 * 1024 * 1024) {
      result.warnings.push('State snapshot file is unusually large (>10MB), may be corrupted')
    }
    
    if (stats.size === 0) {
      result.warnings.push('State snapshot file is empty')
      return result
    }
    
    result.content = fs.readFileSync(stateSnapshotPath, 'utf-8')
    
    // Try to extract timestamp with multiple pattern attempts
    const timePatterns = [
      /Last Snapshot:\s*(.+)/i,
      /Snapshot Time:\s*(.+)/i,
      /Last Updated:\s*(.+)/i,
      /(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2})/,
      /(\d{4}-\d{2}-\d{2})/,
    ]
    
    for (const pattern of timePatterns) {
      const match = result.content.match(pattern)
      if (match) {
        const parsed = parseFlexibleDate(match[1])
        if (parsed) {
          result.snapshotTime = parsed
          break
        }
      }
    }
    
    // Try to extract current phase
    const phasePatterns = [
      /Current Phase:\s*(.+)/i,
      /Phase:\s*(.+)/i,
      /Active Phase:\s*(.+)/i,
      /##\s*(.+?)\s*Phase/i,
    ]
    
    for (const pattern of phasePatterns) {
      const match = result.content.match(pattern)
      if (match) {
        result.lastPhase = match[1].trim().slice(0, 50) // Limit length
        break
      }
    }
    
    return result
  } catch (err: any) {
    result.warnings.push(`Could not read state snapshot: ${err.message}`)
    return result
  }
}

/**
 * Analyze session state to determine best recovery approach
 */
function analyzeSessionState(cwd: string): RecoveryAnalysis {
  const sessionRecoveryPath = path.join(cwd, '.team-config', 'session-recovery.md')
  const gsdProgressPath = path.join(cwd, '.planning', 'STATE.md')
  
  const warnings: string[] = []
  const errors: string[] = []

  // Safely check session recovery file
  let hasSessionRecovery = false
  try {
    if (fs.existsSync(sessionRecoveryPath)) {
      const stats = fs.statSync(sessionRecoveryPath)
      if (stats.size > 0) {
        const content = fs.readFileSync(sessionRecoveryPath, 'utf-8').trim()
        hasSessionRecovery = content.length > 0
        if (!hasSessionRecovery) {
          warnings.push('Session recovery file exists but is empty')
        }
      } else {
        warnings.push('Session recovery file is empty')
      }
    }
  } catch (err: any) {
    warnings.push(`Could not read session recovery file: ${err.message}`)
  }

  // Check GSD progress
  let hasGsdProgress = false
  try {
    hasGsdProgress = fs.existsSync(gsdProgressPath)
  } catch (err: any) {
    warnings.push(`Could not check GSD progress: ${err.message}`)
  }

  // Read state snapshot with error handling
  const snapshot = safelyReadSnapshot(cwd)
  const hasStateSnapshot = snapshot !== null
  
  if (snapshot?.warnings.length) {
    warnings.push(...snapshot.warnings)
  }

  const snapshotTime = snapshot?.snapshotTime
  const lastPhase = snapshot?.lastPhase

  // Determine recommendation
  let recommendation: RecoveryAnalysis['recommendation']
  let reason: string

  if (!hasStateSnapshot && !hasGsdProgress) {
    recommendation = 'fresh'
    reason = 'No state snapshot or GSD progress found. Starting fresh.'
  } else if (hasGsdProgress && !hasStateSnapshot) {
    recommendation = 'continue'
    reason = 'GSD progress exists but no recent snapshot. Will attempt to resume.'
  } else if (snapshotTime) {
    const hoursSinceSnapshot = (Date.now() - snapshotTime.getTime()) / (1000 * 60 * 60)
    
    if (hoursSinceSnapshot > 168) { // 7 days
      recommendation = 'review'
      reason = `Last snapshot was ${Math.round(hoursSinceSnapshot / 24)} days ago. Review before continuing.`
    } else if (hoursSinceSnapshot > 24) {
      recommendation = 'review'
      reason = `Last snapshot was ${Math.round(hoursSinceSnapshot)} hours ago. Review before continuing.`
    } else if (hoursSinceSnapshot < 1) {
      recommendation = 'continue'
      reason = `Very recent snapshot (${Math.round(hoursSinceSnapshot * 60)} minutes ago). Safe to continue.`
    } else {
      recommendation = 'continue'
      reason = `Recent snapshot found (${Math.round(hoursSinceSnapshot)}h ago). Safe to continue.`
    }
  } else {
    recommendation = 'continue'
    reason = 'Session state exists but timestamp unclear. Will attempt to resume.'
    warnings.push('Could not determine snapshot age')
  }

  return {
    hasStateSnapshot,
    hasSessionRecovery,
    hasGsdProgress,
    snapshotTime,
    lastPhase,
    recommendation,
    reason,
    warnings,
    errors,
  }
}

/**
 * Get human-friendly description of session state
 */
function formatRecoveryAnalysis(analysis: RecoveryAnalysis): string {
  const parts: string[] = []

  if (analysis.hasStateSnapshot) {
    parts.push(chalk.green('✓ State snapshot'))
  } else {
    parts.push(chalk.yellow('✗ No state snapshot'))
  }

  if (analysis.hasSessionRecovery) {
    parts.push(chalk.green('✓ Recovery instructions'))
  } else {
    parts.push(chalk.yellow('✗ No recovery instructions'))
  }

  if (analysis.hasGsdProgress) {
    parts.push(chalk.green('✓ GSD progress'))
  }

  if (analysis.lastPhase) {
    parts.push(chalk.blue(`Phase: ${analysis.lastPhase}`))
  }

  if (analysis.snapshotTime) {
    const hoursAgo = Math.round((Date.now() - analysis.snapshotTime.getTime()) / (1000 * 60 * 60))
    let timeStr: string
    if (hoursAgo < 1) {
      const minsAgo = Math.round((Date.now() - analysis.snapshotTime.getTime()) / (1000 * 60))
      timeStr = minsAgo < 1 ? 'just now' : `${minsAgo}m ago`
    } else if (hoursAgo < 24) {
      timeStr = `${hoursAgo}h ago`
    } else {
      const daysAgo = Math.round(hoursAgo / 24)
      timeStr = `${daysAgo}d ago`
    }
    parts.push(chalk.gray(`Snapshot: ${timeStr}`))
  }

  return parts.join(' | ')
}

/**
 * Auto-detect and recover tmux panes if possible
 */
async function detectExistingPanes(cwd: string, sessionName: string): Promise<{ found: boolean; paneIds: string[]; warnings: string[] }> {
  const warnings: string[] = []
  const paneIdFile = path.join(cwd, '.team-config', 'runner-pane-id.txt')
  
  if (!fs.existsSync(paneIdFile)) {
    return { found: false, paneIds: [], warnings }
  }

  try {
    // Check if file is stale (older than 7 days)
    const stats = fs.statSync(paneIdFile)
    const ageMs = Date.now() - stats.mtime.getTime()
    if (ageMs > 7 * 24 * 60 * 60 * 1000) {
      warnings.push('Pane ID file is older than 7 days, may be stale')
    }
    
    const content = fs.readFileSync(paneIdFile, 'utf-8').trim()
    if (!content) {
      return { found: false, paneIds: [], warnings }
    }
    
    const paneIds = content
      .split('\n')
      .map(id => id.trim())
      .filter(id => id.startsWith('%'))
    
    if (paneIds.length === 0) {
      warnings.push('Pane ID file contains no valid pane IDs')
      return { found: false, paneIds: [], warnings }
    }
    
    // Verify panes exist in current session
    let existingPanes: { id: string; active: boolean; command: string }[]
    try {
      existingPanes = listPanes(sessionName)
    } catch (err: any) {
      warnings.push(`Could not list panes: ${err.message}`)
      return { found: false, paneIds: [], warnings }
    }
    
    const existingIds = new Set(existingPanes.map(p => p.id))
    
    const validPaneIds = paneIds.filter(id => {
      if (!existingIds.has(id)) {
        warnings.push(`Pane ${id} from saved state no longer exists`)
        return false
      }
      return true
    })
    
    return {
      found: validPaneIds.length > 0,
      paneIds: validPaneIds,
      warnings,
    }
  } catch (err: any) {
    warnings.push(`Error reading pane IDs: ${err.message}`)
    return { found: false, paneIds: [], warnings }
  }
}

export async function runResume(options: ResumeOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()

  try {
    checkPrereqs(['tmux', 'claude'])
  } catch (err: any) {
    console.error(chalk.red(`✗ Prerequisites not met: ${err.message}`))
    process.exit(1)
  }

  if (!teamConfigExists(cwd)) {
    console.error(chalk.red('✗ No .team-config/ found'))
    console.log(chalk.gray('Run crewpilot init to set up your project first.'))
    process.exit(1)
  }

  let userContext: string
  try {
    userContext = fs.readFileSync(path.join(cwd, '.team-config', 'USER-CONTEXT.md'), 'utf-8')
  } catch (err: any) {
    console.error(chalk.red('✗ Cannot read .team-config/USER-CONTEXT.md'))
    console.log(chalk.gray('Your project configuration may be incomplete.'))
    console.log(chalk.gray('Run crewpilot init to reinitialize your project.'))
    process.exit(1)
  }
  
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)

  // Check if session already exists and is alive
  if (sessionExists(sessionName)) {
    let panes: { id: string; active: boolean; command: string }[]
    try {
      panes = listPanes(sessionName)
    } catch (err: any) {
      console.log(chalk.yellow(`⚠ Could not list panes in session "${sessionName}": ${err.message}`))
      panes = []
    }
    
    if (panes.length > 0) {
      console.log(chalk.green(`✓ Session "${sessionName}" is active with ${panes.length} pane(s).`))
      
      const action = await select({
        message: 'What would you like to do?',
        choices: [
          { name: 'Attach to existing session', value: 'attach' },
          { name: 'Check runner status', value: 'status' },
          { name: 'Stop and restart fresh', value: 'restart' },
          { name: 'Cancel', value: 'cancel' },
        ],
      })

      if (action === 'attach') {
        attachSession(sessionName)
        return
      } else if (action === 'status') {
        const { runCheck } = await import('./watch.js')
        runCheck(cwd)
        
        const proceed = await confirm({
          message: 'Attach to session now?',
          default: true,
        })
        if (proceed) {
          attachSession(sessionName)
        }
        return
      } else if (action === 'cancel') {
        console.log(chalk.gray('Aborted.'))
        return
      }
      // Fall through to restart if selected
    }
  }

  // Analyze session state for auto-detection
  const analysis = analyzeSessionState(cwd)
  
  console.log(chalk.bold('\n── Session Recovery Analysis ──\n'))
  console.log(formatRecoveryAnalysis(analysis))
  console.log(chalk.gray(`\nRecommendation: ${analysis.reason}`))
  
  // Show warnings if any
  if (analysis.warnings.length > 0) {
    console.log(chalk.yellow('\n⚠ Warnings:'))
    for (const warning of analysis.warnings) {
      console.log(chalk.yellow(`  • ${warning}`))
    }
  }

  // In auto mode, follow recommendation without prompting
  let useFresh = options.fresh
  if (!useFresh && options.auto) {
    useFresh = analysis.recommendation === 'fresh'
    console.log(chalk.blue(`\nAuto-selected: ${useFresh ? 'fresh start' : 'continue session'}`))
  }

  // If review recommended, ask user
  if (analysis.recommendation === 'review' && !options.fresh && !options.auto) {
    const showStatus = await confirm({
      message: 'Show current status before resuming?',
      default: true,
    })
    
    if (showStatus) {
      try {
        const { runStatus } = await import('./status.js')
        runStatus(cwd)
      } catch (err) {
        console.log(chalk.gray('Could not show status, continuing...'))
      }
    }

    const resumeMode = await select({
      message: 'How would you like to resume?',
      choices: [
        { name: 'Continue from last state', value: 'continue' },
        { name: 'Start fresh (keep files)', value: 'fresh' },
        { name: 'Cancel', value: 'cancel' },
      ],
    })

    if (resumeMode === 'cancel') {
      console.log(chalk.gray('Aborted.'))
      return
    }
    
    useFresh = resumeMode === 'fresh'
  }

  // Safety warning - skip if noAttach is true (non-interactive mode)
  if (!options.noAttach) {
    const proceed = await confirm({
      message: chalk.yellow(
        '\n⚠ WARNING: Crewpilot launches Claude Code with --dangerously-skip-permissions.\n' +
        'This disables all permission gates. Claude Code will have unrestricted access\n' +
        'to your file system and shell. Only proceed in a controlled environment.\n\n' +
        'Continue?'
      ),
      default: true,
    })
    if (!proceed) {
      console.log(chalk.gray('Aborted.'))
      return
    }
  }

  // Stop existing session if restarting
  if (sessionExists(sessionName)) {
    console.log(chalk.yellow(`Stopping existing session: ${sessionName}`))
    const { killSession } = await import('../tmux.js')
    try {
      killSession(sessionName)
      sleepMs(1000)
    } catch (err: any) {
      console.log(chalk.yellow(`⚠ Could not stop existing session cleanly: ${err.message}`))
      console.log(chalk.gray('Proceeding anyway...'))
    }
  }

  console.log(chalk.blue(`Creating session: ${sessionName}`))
  try {
    createSession(sessionName, cwd)
  } catch (err: any) {
    console.error(chalk.red(`✗ Failed to create session "${sessionName}": ${err.message}`))
    console.log(chalk.gray('If a session already exists, run crewpilot stop first.'))
    process.exit(1)
  }

  const claudeCmd = useFresh
    ? 'claude --dangerously-skip-permissions'
    : 'claude --continue --dangerously-skip-permissions'

  try {
    sendKeys(`${sessionName}:0`, claudeCmd)
    sendEnter(`${sessionName}:0`)
    sleepMs(4000)

    sendTextInput(`${sessionName}:0`, RECOVERY_PROMPT)
  } catch (err: any) {
    console.error(chalk.red(`✗ Failed to send commands to session: ${err.message}`))
    console.log(chalk.gray('The session was created but may not be properly initialized.'))
    console.log(chalk.gray('Try attaching manually: tmux attach -t ' + sessionName))
    process.exit(1)
  }

  console.log(chalk.green(`\n✓ Crewpilot ${useFresh ? 'started fresh' : 'resumed'}!`))
  console.log(chalk.gray(`Session: ${sessionName}`))
  
  if (analysis.lastPhase) {
    console.log(chalk.gray(`Last known phase: ${analysis.lastPhase}`))
  }

  if (!options.noAttach) {
    console.log(chalk.blue('\nAttaching to session...'))
    attachSession(sessionName)
  } else {
    console.log(chalk.gray('\n💡 Tip: Run "crewpilot watch" to monitor runner activity'))
    console.log(chalk.gray(`       Attach later with: tmux attach -t ${sessionName}`))
  }
}
