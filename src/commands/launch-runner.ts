import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName, writeLockfile } from '../utils.js'
import {
  sessionExists,
  createWindow,
  sendKeys,
  sendEnter,
  sendTextInput,
  sleepMs,
  listPanes,
} from '../tmux.js'

interface LaunchRunnerOptions {
  cwd?: string
  workflow?: 'gsd' | 'superpowers'
  prompt?: string
}

export async function runLaunchRunner(options: LaunchRunnerOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()

  checkPrereqs(['tmux', 'claude'])

  if (!teamConfigExists(cwd)) {
    throw new Error(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`)
  }

  let userContext: string
  try {
    userContext = fs.readFileSync(path.join(cwd, '.team-config', 'USER-CONTEXT.md'), 'utf-8')
  } catch {
    throw new Error(`Cannot read .team-config/USER-CONTEXT.md. Run ${chalk.cyan('crewpilot init')} first.`)
  }
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)

  if (!sessionExists(sessionName)) {
    throw new Error(`Session "${sessionName}" is not active. Run ${chalk.cyan('crewpilot start')} first.`)
  }

  // Check if a runner is already alive
  const runnerPanePath = path.join(cwd, '.team-config', 'runner-pane-id.txt')
  try {
    const existingPaneId = fs.readFileSync(runnerPanePath, 'utf-8').trim()
    if (existingPaneId) {
      const panes = listPanes(sessionName)
      const isAlive = panes.some(p => p.id === existingPaneId)
      if (isAlive) {
        throw new Error(`Runner ${existingPaneId} is already running. Use ${chalk.cyan('crewpilot stop-runner')} first.`)
      }
    }
  } catch (err: any) {
    if (err.message?.includes('already running')) throw err
    // File missing or unreadable — proceed
  }

  // Create a detached window
  console.log(chalk.blue('Creating runner pane...'))
  const paneId = createWindow(sessionName)

  // Navigate to project directory
  sendKeys(paneId, `cd ${cwd}`)
  sendEnter(paneId)
  sleepMs(1000)

  // Launch Claude Code
  sendKeys(paneId, 'claude --dangerously-skip-permissions')
  sendEnter(paneId)
  sleepMs(4000)

  // Send workflow command
  if (options.workflow === 'gsd') {
    sendKeys(paneId, '/gsd:new-project')
    sendEnter(paneId)
    sleepMs(1000)
    sendEnter(paneId)
  } else if (options.workflow === 'superpowers') {
    const prompt = options.prompt ?? 'Start the project'
    sendTextInput(paneId, `${prompt} /superpowers:brainstorming`)
  } else if (options.prompt) {
    sendTextInput(paneId, options.prompt)
  }

  // Record pane ID
  fs.writeFileSync(runnerPanePath, paneId + '\n', 'utf-8')

  // Write runner lock
  writeLockfile(cwd, '.runner-lock', paneId)

  console.log(chalk.green(`Runner launched in pane ${paneId}`))
  console.log(chalk.gray(`Workflow: ${options.workflow ?? 'custom prompt'}`))
}
