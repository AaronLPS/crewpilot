import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName } from '../utils.js'
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

interface ResumeOptions {
  cwd?: string
  fresh?: boolean
  noAttach?: boolean
}

export async function runResume(options: ResumeOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()

  checkPrereqs(['tmux', 'claude'])

  if (!teamConfigExists(cwd)) {
    throw new Error(
      `No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`
    )
  }

  let userContext: string
  try {
    userContext = fs.readFileSync(path.join(cwd, '.team-config', 'USER-CONTEXT.md'), 'utf-8')
  } catch {
    throw new Error(`Cannot read .team-config/USER-CONTEXT.md. Run ${chalk.cyan('crewpilot init')} first.`)
  }
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)

  if (sessionExists(sessionName)) {
    const panes = listPanes(sessionName)
    if (panes.length > 0) {
      console.log(chalk.green(`Session "${sessionName}" is alive with ${panes.length} pane(s). Attaching...`))
      attachSession(sessionName)
      return
    }
  }

  const proceed = await confirm({
    message: chalk.yellow(
      'WARNING: Crewpilot launches Claude Code with --dangerously-skip-permissions.\n' +
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

  console.log(chalk.blue(`Creating new session: ${sessionName}`))
  createSession(sessionName, cwd)

  const claudeCmd = options.fresh
    ? 'claude --dangerously-skip-permissions'
    : 'claude --continue --dangerously-skip-permissions'

  sendKeys(`${sessionName}:0`, claudeCmd)
  sendEnter(`${sessionName}:0`)
  sleepMs(4000)

  sendTextInput(`${sessionName}:0`, RECOVERY_PROMPT)

  console.log(chalk.green(`\nCrewpilot resumed! Session: ${sessionName}`))
  console.log(chalk.gray(`Mode: ${options.fresh ? 'fresh start with recovery' : 'continuing last conversation'}`))

  if (!options.noAttach) {
    console.log(chalk.blue('\nAttaching to session...'))
    attachSession(sessionName)
  }
}
