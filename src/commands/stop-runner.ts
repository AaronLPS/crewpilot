import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName, removeLockfile } from '../utils.js'
import {
  sessionExists,
  sendKeys,
  sendEnter,
  sleepMs,
  listPanes,
} from '../tmux.js'

interface StopRunnerOptions {
  cwd?: string
  force?: boolean
}

export function runStopRunner(options: StopRunnerOptions = {}): void {
  const cwd = options.cwd ?? process.cwd()

  checkPrereqs(['tmux'])

  if (!teamConfigExists(cwd)) {
    throw new Error(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`)
  }

  const runnerPanePath = path.join(cwd, '.team-config', 'runner-pane-id.txt')
  let paneId: string
  try {
    paneId = fs.readFileSync(runnerPanePath, 'utf-8').trim()
  } catch {
    throw new Error('No runner-pane-id.txt found — no active runner.')
  }

  if (!paneId) {
    throw new Error('No pane ID in runner-pane-id.txt — no active runner.')
  }

  // Get session name for pane validation
  let userContext: string
  try {
    userContext = fs.readFileSync(path.join(cwd, '.team-config', 'USER-CONTEXT.md'), 'utf-8')
  } catch {
    throw new Error(`Cannot read .team-config/USER-CONTEXT.md.`)
  }
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)

  // Check if pane is actually alive
  const panes = listPanes(sessionName)
  const isAlive = panes.some(p => p.id === paneId)

  if (isAlive) {
    if (options.force) {
      // Force kill via tmux
      try {
        const { execFileSync } = require('node:child_process')
        execFileSync('tmux', ['kill-pane', '-t', paneId], { stdio: 'pipe' })
      } catch {
        // Already dead
      }
      console.log(chalk.yellow(`Force-killed runner pane ${paneId}`))
    } else {
      // Graceful shutdown
      console.log(chalk.blue(`Sending /exit to runner pane ${paneId}...`))
      sendKeys(paneId, '/exit')
      sendEnter(paneId)
      sleepMs(1000)
      sendEnter(paneId)
      sleepMs(3000)
      console.log(chalk.green(`Runner ${paneId} shutdown signal sent.`))
    }
  } else {
    console.log(chalk.gray(`Runner pane ${paneId} is already dead.`))
  }

  // Clean up
  fs.writeFileSync(runnerPanePath, '', 'utf-8')
  removeLockfile(cwd, '.runner-lock')
  console.log(chalk.green('Runner pane ID and lock cleaned up.'))
}
