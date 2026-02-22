import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName } from '../utils.js'
import {
  sessionExists,
  killSession,
  listPanes,
  sendKeys,
  sendEnter,
  sleepMs,
} from '../tmux.js'

export function runStop(cwd?: string): void {
  const dir = cwd ?? process.cwd()

  checkPrereqs(['tmux'])

  if (!teamConfigExists(dir)) {
    throw new Error(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`)
  }

  let userContext: string
  try {
    userContext = fs.readFileSync(
      path.join(dir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
  } catch {
    throw new Error(`Cannot read .team-config/USER-CONTEXT.md. Run ${chalk.cyan('crewpilot init')} first.`)
  }
  const projectName = getProjectName(userContext) ?? path.basename(dir)
  const sessionName = getSessionName(projectName)

  if (!sessionExists(sessionName)) {
    throw new Error(`No active session "${sessionName}". Nothing to stop.`)
  }

  console.log(chalk.blue(`Stopping session: ${sessionName}`))

  const VALID_PANE_ID = /^%\d+$/

  let runnerPaneIds: string[] = []
  try {
    const runnerPanePath = path.join(dir, '.team-config', 'runner-pane-id.txt')
    const runnerPaneContent = fs.readFileSync(runnerPanePath, 'utf-8').trim()
    const MAX_RUNNER_PANES = 32
    runnerPaneIds = runnerPaneContent
      ? runnerPaneContent.split('\n').filter(Boolean).slice(0, MAX_RUNNER_PANES)
      : []
  } catch {
    // runner-pane-id.txt missing — no runners to stop
  }

  const sessionPanes = listPanes(sessionName)
  const sessionPaneIds = new Set(sessionPanes.map(p => p.id))

  runnerPaneIds = runnerPaneIds.filter((id) => {
    if (!VALID_PANE_ID.test(id)) {
      console.warn(chalk.yellow(`Skipping invalid pane ID: ${id}`))
      return false
    }
    if (!sessionPaneIds.has(id)) {
      console.warn(chalk.yellow(`Skipping pane ${id}: not in session ${sessionName}`))
      return false
    }
    return true
  })

  for (const paneId of runnerPaneIds) {
    try {
      console.log(chalk.gray(`Sending /exit to runner pane ${paneId}...`))
      sendKeys(paneId, '/exit')
      sendEnter(paneId)
      sleepMs(1000)
      sendEnter(paneId)
    } catch {
      // Pane may already be dead
    }
  }

  if (runnerPaneIds.length > 0) {
    console.log(chalk.gray('Waiting for runners to shut down...'))
    sleepMs(5000)
  }

  try {
    const panes = listPanes(sessionName)
    if (panes.length > 0) {
      console.log(chalk.gray('Sending /exit to Team Lead...'))
      sendKeys(`${sessionName}:0`, '/exit')
      sendEnter(`${sessionName}:0`)
      sleepMs(1000)
      sendEnter(`${sessionName}:0`)
      sleepMs(3000)
    }
  } catch {
    // Session may already be closing
  }

  try {
    killSession(sessionName)
  } catch {
    // Already dead
  }

  console.log(chalk.green(`\nCrewpilot stopped. State preserved in .team-config/`))
  console.log(chalk.gray(`Use ${chalk.cyan('crewpilot resume')} to continue later.`))
}
