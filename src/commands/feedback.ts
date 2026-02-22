import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { teamConfigExists } from '../scaffold.js'
import { formatTimestamp } from '../utils.js'

export function runFeedback(message: string, cwd?: string): void {
  const dir = cwd ?? process.cwd()

  if (!teamConfigExists(dir)) {
    throw new Error(
      `No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`
    )
  }

  const inboxPath = path.join(dir, '.team-config', 'human-inbox.md')
  const entry = `\n## [${formatTimestamp()}]\n${message}\n`

  fs.appendFileSync(inboxPath, entry, 'utf-8')

  console.log(chalk.green('Feedback sent. Team Lead will pick it up on next polling cycle.'))
}
