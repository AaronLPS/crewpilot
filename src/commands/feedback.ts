import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { teamConfigExists } from '../scaffold.js'
import { formatTimestamp } from '../utils.js'

const MAX_FEEDBACK_LENGTH = 4096

export function runFeedback(message: string, cwd?: string): void {
  const dir = cwd ?? process.cwd()

  if (!teamConfigExists(dir)) {
    throw new Error(
      `No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`
    )
  }

  if (message.length > MAX_FEEDBACK_LENGTH) {
    throw new Error(`Feedback message too long (${message.length} chars). Maximum is ${MAX_FEEDBACK_LENGTH}.`)
  }

  const sanitized = message.replace(/^##+ /gm, '')

  const inboxPath = path.join(dir, '.team-config', 'human-inbox.md')
  const entry = `\n## [${formatTimestamp()}]\n${sanitized}\n`

  fs.appendFileSync(inboxPath, entry, 'utf-8')

  console.log(chalk.green('Feedback sent. Team Lead will pick it up on next polling cycle.'))
}
