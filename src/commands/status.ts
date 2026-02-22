import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName } from '../utils.js'
import { sessionExists, listPanes } from '../tmux.js'

export interface StatusInfo {
  projectName: string
  sessionName: string
  sessionActive: boolean
  paneCount: number
  stateSnapshot: string
  gsdProgress: string
  pendingDecisions: string
}

function readFileOrEmpty(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch {
    return ''
  }
}

export function getStatusInfo(cwd: string): StatusInfo {
  const userContext = readFileOrEmpty(path.join(cwd, '.team-config', 'USER-CONTEXT.md'))
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)

  const isActive = sessionExists(sessionName)
  const panes = isActive ? listPanes(sessionName) : []

  return {
    projectName,
    sessionName,
    sessionActive: isActive,
    paneCount: panes.length,
    stateSnapshot: readFileOrEmpty(path.join(cwd, '.team-config', 'state-snapshot.md')),
    gsdProgress: readFileOrEmpty(path.join(cwd, '.planning', 'STATE.md')),
    pendingDecisions: readFileOrEmpty(path.join(cwd, '.team-config', 'needs-human-decision.md')),
  }
}

export function runStatus(cwd?: string): void {
  const dir = cwd ?? process.cwd()

  if (!teamConfigExists(dir)) {
    console.log(chalk.red(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`))
    return
  }

  const info = getStatusInfo(dir)

  console.log(chalk.bold(`\n── Crewpilot Status: ${info.projectName} ──\n`))

  if (info.sessionActive) {
    console.log(chalk.green(`Session: ${info.sessionName} (active, ${info.paneCount} pane${info.paneCount !== 1 ? 's' : ''})`))
  } else {
    console.log(chalk.yellow(`Session: ${info.sessionName} (inactive)`))
  }

  if (info.stateSnapshot) {
    console.log(chalk.bold('\nLast Snapshot:'))
    console.log(chalk.gray(info.stateSnapshot))
  } else {
    console.log(chalk.gray('\nNo state snapshot available.'))
  }

  if (info.gsdProgress) {
    console.log(chalk.bold('\nGSD Progress:'))
    console.log(chalk.gray(info.gsdProgress))
  }

  if (info.pendingDecisions) {
    console.log(chalk.bold.red('\nPending Decisions:'))
    console.log(chalk.yellow(info.pendingDecisions))
  } else {
    console.log(chalk.gray('\nPending Decisions: None'))
  }

  console.log('')
}
