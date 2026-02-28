import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { sendOption, sendTextInput } from '../tmux.js'

interface SendAnswerOptions {
  cwd?: string
  option?: number
  text?: string
}

export function runSendAnswer(options: SendAnswerOptions = {}): void {
  const cwd = options.cwd ?? process.cwd()

  checkPrereqs(['tmux'])

  if (!teamConfigExists(cwd)) {
    throw new Error(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`)
  }

  if (options.option !== undefined && options.text !== undefined) {
    throw new Error('Specify only one of --option or --text, not both.')
  }

  if (options.option === undefined && options.text === undefined) {
    throw new Error('Specify --option or --text to send input to the Runner.')
  }

  // Read runner pane ID
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

  if (options.option !== undefined) {
    console.log(chalk.blue(`Selecting option ${options.option} in pane ${paneId}...`))
    sendOption(paneId, options.option)
    console.log(chalk.green('Option selected.'))
  } else if (options.text !== undefined) {
    console.log(chalk.blue(`Sending text to pane ${paneId}...`))
    sendTextInput(paneId, options.text)
    console.log(chalk.green('Text sent.'))
  }
}
