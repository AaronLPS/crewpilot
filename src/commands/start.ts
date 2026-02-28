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
  sendKeys,
  sendEnter,
  attachSession,
  sleepMs,
} from '../tmux.js'

const BOOTSTRAP_PROMPT = `Read .team-config/team-lead-persona.md, then .team-config/target-user-profile.md, then .team-config/USER-CONTEXT.md. You are the Team Lead. Begin the startup workflow as described in your persona.`

interface StartOptions {
  cwd?: string
  noAttach?: boolean
}

export async function runStart(options: StartOptions = {}): Promise<void> {
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
    const action = await confirm({
      message: `Session "${sessionName}" already exists. Attach to it?`,
      default: true,
    })
    if (action) {
      attachSession(sessionName)
      return
    }
    console.log(chalk.yellow(`Use ${chalk.cyan('crewpilot stop')} first to stop the existing session.`))
    return
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

  console.log(chalk.blue(`Creating tmux session: ${sessionName}`))
  try {
    createSession(sessionName, cwd)
  } catch {
    throw new Error(`Failed to create tmux session. Check that tmux is running and no duplicate session exists.`)
  }

  sendKeys(`${sessionName}:0`, `claude --dangerously-skip-permissions`)
  sendEnter(`${sessionName}:0`)
  sleepMs(4000)

  // Send bootstrap prompt - single Enter for initial prompt
  sendKeys(`${sessionName}:0`, BOOTSTRAP_PROMPT)
  sleepMs(500)
  sendEnter(`${sessionName}:0`)

  console.log(chalk.green(`\nCrewpilot started! Session: ${sessionName}`))
  console.log('')
  console.log(chalk.gray('How to interact:'))
  console.log(chalk.gray(`  Attach:   tmux attach -t ${sessionName}`))
  console.log(chalk.gray(`  Feedback: crewpilot feedback "your message"`))
  console.log(chalk.gray(`  Status:   crewpilot status`))
  console.log(chalk.gray(`  Stop:     crewpilot stop`))

  if (!options.noAttach) {
    console.log(chalk.blue('\nAttaching to session...'))
    attachSession(sessionName)
  }
}
