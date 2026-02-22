import { Command } from 'commander'
import { runInit } from './commands/init.js'
import { runStart } from './commands/start.js'
import { runResume } from './commands/resume.js'
import { runStatus } from './commands/status.js'
import { runFeedback } from './commands/feedback.js'
import { runStop } from './commands/stop.js'

const program = new Command()

program
  .name('crewpilot')
  .description('CLI tool that bootstraps and manages an AI Agent Team framework on top of Claude Code')
  .version('0.1.0')

program
  .command('init')
  .description('Initialize a new Crewpilot project')
  .option('--name <name>', 'Project name (skip prompt)')
  .option('--description <desc>', 'Project description (skip prompt)')
  .option('--user <user>', 'Target user description (skip prompt)')
  .option('--tech <tech>', 'Tech stack / constraints (skip prompt)')
  .option('--workflow <workflow>', 'Preferred workflow: gsd or superpowers (skip prompt)')
  .option('--existing', 'Scan existing codebase to auto-generate project-context.md')
  .action(async (opts) => {
    try {
      await runInit({
        name: opts.name,
        description: opts.description,
        user: opts.user,
        tech: opts.tech,
        workflow: opts.workflow,
        existing: opts.existing,
      })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('start')
  .description('Launch the Crewpilot framework')
  .option('--no-attach', 'Do not attach to tmux session (background mode)')
  .action(async (opts) => {
    try {
      await runStart({ noAttach: !opts.attach })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('resume')
  .description('Resume an interrupted Crewpilot session')
  .option('--fresh', 'Start new conversation instead of continuing last one')
  .option('--no-attach', 'Do not attach to tmux session')
  .action(async (opts) => {
    try {
      await runResume({ fresh: opts.fresh, noAttach: !opts.attach })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('status')
  .description('Show current project status')
  .action(() => {
    try {
      runStatus()
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('feedback')
  .description('Send async feedback to the Team Lead')
  .argument('<message>', 'Feedback message')
  .action((message) => {
    try {
      runFeedback(message)
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('stop')
  .description('Gracefully stop the Crewpilot framework')
  .action(() => {
    try {
      runStop()
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program.parse()
