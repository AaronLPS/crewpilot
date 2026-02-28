import { Command } from 'commander'
import { runInit } from './commands/init.js'
import { runStart } from './commands/start.js'
import { runResume } from './commands/resume.js'
import { runStatus } from './commands/status.js'
import { runFeedback } from './commands/feedback.js'
import { runStop } from './commands/stop.js'
import { runSearch } from './commands/search.js'
import { runWatch, runCheck } from './commands/watch.js'
import { runDashboard } from './commands/dashboard.js'
import { runMonitor } from './commands/monitor.js'
import { runExport } from './commands/export.js'

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
  .option('--auto', 'Auto-detect best resume strategy without prompts')
  .action(async (opts) => {
    try {
      await runResume({ fresh: opts.fresh, noAttach: !opts.attach, auto: opts.auto })
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

program
  .command('search')
  .description('Search across memory files (user-research, evaluations, logs)')
  .argument('<query>', 'Search query')
  .option('--rebuild-index', 'Rebuild the search index before searching')
  .option('-l, --limit <n>', 'Limit results to N entries', '20')
  .option('--case-sensitive', 'Perform case-sensitive search')
  .option('--fuzzy', 'Enable fuzzy matching for approximate searches')
  .action((query, opts) => {
    try {
      runSearch(query, {
        rebuildIndex: opts.rebuildIndex,
        limit: parseInt(opts.limit, 10),
        caseSensitive: opts.caseSensitive,
        fuzzy: opts.fuzzy,
      })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('watch')
  .description('Monitor runners and notify on state changes (questions, errors)')
  .option('-i, --interval <seconds>', 'Poll interval in seconds', '5')
  .option('-n, --notify <method>', 'Notification method: desktop, log, or both', 'desktop')
  .option('--log-file <path>', 'Path to notification log file')
  .option('--once', 'Check once and exit (no continuous watch)')
  .option('--rate-limit <minutes>', 'Minimum minutes between same-type notifications', '5')
  .action(async (opts) => {
    try {
      await runWatch({
        pollInterval: parseInt(opts.interval, 10),
        notify: opts.notify,
        logFile: opts.logFile,
        once: opts.once,
        rateLimit: parseInt(opts.rateLimit, 10),
      })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('check')
  .description('Quick check of runner states (one-shot status)')
  .action(() => {
    try {
      runCheck()
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('dashboard')
  .description('Start the web dashboard for monitoring runners')
  .option('-p, --port <port>', 'Port to run the dashboard on', '3000')
  .option('-r, --refresh <seconds>', 'Auto-refresh interval in seconds', '5')
  .action(async (opts) => {
    try {
      await runDashboard({
        port: parseInt(opts.port, 10),
        refreshRate: parseInt(opts.refresh, 10),
      })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('monitor')
  .description('Start heartbeat monitoring for stuck/dead runner detection')
  .option('-i, --interval <seconds>', 'Check interval in seconds', '30')
  .option('-n, --notify <method>', 'Notification method: desktop, log, or both', 'both')
  .action(async (opts) => {
    try {
      await runMonitor({
        interval: parseInt(opts.interval, 10),
        notify: opts.notify,
      })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('export')
  .description('Export project report to markdown or JSON')
  .option('-f, --format <format>', 'Export format: markdown or json', 'markdown')
  .option('-o, --output <path>', 'Output file path')
  .option('--include-logs', 'Include full communication logs in export', false)
  .action((opts) => {
    try {
      runExport({
        format: opts.format,
        output: opts.output,
        includeLogs: opts.includeLogs,
      })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program.parse()
