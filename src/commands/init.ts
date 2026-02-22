import path from 'node:path'
import { input, select, confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { scaffoldTeamConfig, teamConfigExists, appendClaudeMd } from '../scaffold.js'
import { claudeMdAppend } from '../templates.js'
import { execFileSync } from 'node:child_process'

interface InitOptions {
  cwd?: string
  name?: string
  workflow?: string
  existing?: boolean
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()

  if (options.existing) {
    checkPrereqs(['claude'])
  }

  if (teamConfigExists(cwd)) {
    const overwrite = await confirm({
      message: '.team-config/ already exists. Overwrite?',
      default: false,
    })
    if (!overwrite) {
      console.log(chalk.yellow('Init cancelled.'))
      return
    }
  }

  const projectName = options.name ?? await input({
    message: 'Project name',
    default: path.basename(cwd),
  })

  const description = await input({
    message: 'Project description',
  })

  const userDescription = await input({
    message: 'Target user description (who is this for?)',
  })

  const techStack = await input({
    message: 'Tech stack / constraints',
  })

  const workflow = options.workflow ?? await select({
    message: 'Preferred workflow',
    choices: [
      { name: 'GSD (spec-driven development)', value: 'gsd' },
      { name: 'Superpowers (feature-driven + TDD)', value: 'superpowers' },
      { name: 'Decide later', value: 'ask-me-later' },
    ],
  })

  scaffoldTeamConfig(cwd, {
    projectName,
    description,
    userDescription,
    techStack,
    workflow,
  })

  appendClaudeMd(cwd, claudeMdAppend())

  if (options.existing) {
    console.log(chalk.blue('Scanning codebase with Claude Code...'))
    try {
      const analysis = execFileSync('claude', [
        '--print',
        '-p',
        'Analyze this codebase directory structure, detect languages, frameworks, and architecture patterns. Output a concise markdown summary suitable for a project-context.md file. Do not include file listings longer than 20 items.',
      ], {
        cwd,
        stdio: 'pipe',
        timeout: 60000,
      }).toString()

      const { writeFileSync } = await import('node:fs')
      const contextPath = path.join(cwd, '.team-config', 'project-context.md')
      writeFileSync(contextPath, `# Project Context\n\n${analysis}`, 'utf-8')
      console.log(chalk.green('Codebase analysis written to .team-config/project-context.md'))
    } catch {
      console.log(chalk.yellow('Codebase scan failed. You can fill in project-context.md manually.'))
    }
  }

  console.log(chalk.green(`\nCrewpilot initialized for "${projectName}"!`))
  console.log(chalk.gray('Created .team-config/ with all template files'))
  console.log(chalk.gray('Updated CLAUDE.md with Team Lead directives'))
  console.log(`\nNext: ${chalk.cyan('crewpilot start')} to launch the framework`)
}
