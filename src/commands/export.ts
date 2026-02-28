import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName, formatTimestamp } from '../utils.js'
import { sessionExists, listPanes } from '../tmux.js'

export interface ExportOptions {
  format?: 'markdown' | 'json'
  output?: string
  includeLogs?: boolean
  cwd?: string
}

export interface ProjectSummary {
  projectName: string
  description: string
  techStack: string
  workflow: string
  sessionStart?: string
  sessionEnd?: string
  duration?: string
}

export interface ProgressReport {
  currentPhase: string
  milestonesCompleted: string[]
  filesCreated: string[]
  filesModified: string[]
  stateSummary: string
}

export interface Decision {
  timestamp: string
  workflow: string
  phase: string
  question: string
  answer: string
  basis: string
}

export interface UserResearch {
  profileSummary: string
  findings: string[]
}

export interface Evaluation {
  filename: string
  content: string
}

export interface ExportData {
  metadata: {
    exportTime: string
    version: string
    format: string
  }
  projectSummary: ProjectSummary
  progressReport: ProgressReport
  decisions: Decision[]
  userResearch?: UserResearch
  evaluations: Evaluation[]
  communicationLogs?: string
}

function readFileOrEmpty(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch {
    return ''
  }
}

function parseUserContext(content: string): Partial<ProjectSummary> {
  const projectName = content.match(/^## Project Name\n(.+)$/m)?.[1]?.trim() ?? ''
  const description = content.match(/^## Description\n(.+)$/m)?.[1]?.trim() ?? ''
  const techStack = content.match(/^## Tech Stack \/ Constraints\n(.+)$/m)?.[1]?.trim() ?? ''
  const workflow = content.match(/^## Preferred Workflow\n(.+)$/m)?.[1]?.trim() ?? 'gsd'

  return { projectName, description, techStack, workflow }
}

function parseCommunicationLog(content: string): Decision[] {
  const decisions: Decision[] = []
  const lines = content.split('\n')
  let currentDecision: Partial<Decision> = {}
  let inDecision = false

  for (const line of lines) {
    // Parse header: ## timestamp | workflow | Phase N
    const headerMatch = line.match(/^##\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*Phase\s*(\d+)/i)
    if (headerMatch) {
      if (inDecision && currentDecision.timestamp) {
        decisions.push(currentDecision as Decision)
      }
      currentDecision = {
        timestamp: headerMatch[1].trim(),
        workflow: headerMatch[2].trim(),
        phase: `Phase ${headerMatch[3].trim()}`,
      }
      inDecision = true
      continue
    }

    const qMatch = line.match(/^Q:\s*"(.+)"/i)
    if (qMatch && inDecision) {
      currentDecision.question = qMatch[1].trim()
      continue
    }

    const aMatch = line.match(/^A:\s*\(User Proxy\)\s*"(.+)"/i)
    if (aMatch && inDecision) {
      currentDecision.answer = aMatch[1].trim()
      continue
    }

    const basisMatch = line.match(/^Basis:\s*(.+)/i)
    if (basisMatch && inDecision) {
      currentDecision.basis = basisMatch[1].trim()
    }
  }

  if (inDecision && currentDecision.timestamp) {
    decisions.push(currentDecision as Decision)
  }

  return decisions
}

function parseStateFile(content: string): ProgressReport {
  const lines = content.split('\n').filter(l => l.trim())
  const currentPhase = lines.find(l => l.toLowerCase().includes('phase')) ?? ''

  const milestonesCompleted: string[] = []
  const filesCreated: string[] = []
  const filesModified: string[] = []

  let inMilestones = false
  let inFiles = false

  for (const line of lines) {
    if (line.match(/milestone|completed|done/i)) {
      inMilestones = true
      inFiles = false
    }
    if (line.match(/files?\s+(created|modified)|changed/i)) {
      inMilestones = false
      inFiles = true
    }

    if (inMilestones && line.match(/^[-*]\s+/)) {
      milestonesCompleted.push(line.replace(/^[-*]\s+/, '').trim())
    }

    if (inFiles && line.match(/^[-*]\s+/)) {
      const fileEntry = line.replace(/^[-*]\s+/, '').trim()
      if (line.toLowerCase().includes('created')) {
        filesCreated.push(fileEntry)
      } else if (line.toLowerCase().includes('modified')) {
        filesModified.push(fileEntry)
      }
    }
  }

  return {
    currentPhase,
    milestonesCompleted,
    filesCreated,
    filesModified,
    stateSummary: content,
  }
}

function parseTargetUserProfile(content: string): UserResearch {
  const findings: string[] = []
  const lines = content.split('\n')

  let inSection = false
  for (const line of lines) {
    if (line.match(/^##\s*(Core Needs|Pain Points|Research Findings)/i)) {
      inSection = true
      continue
    }
    if (line.match(/^##/) && inSection) {
      inSection = false
    }
    if (inSection && line.match(/^\d+\.\s+(.+)/)) {
      const finding = line.replace(/^\d+\.\s+/, '').trim()
      if (finding && !finding.includes('To be determined') && !finding.includes('(To be determined')) {
        findings.push(finding)
      }
    }
    // Also capture lines that start with "- " in Research Findings section
    if (inSection && line.match(/^[-*]\s+(.+)/)) {
      const finding = line.replace(/^[-*]\s+/, '').trim()
      if (finding && !finding.includes('To be determined') && !finding.includes('(To be determined')) {
        findings.push(finding)
      }
    }
  }

  return {
    profileSummary: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
    findings,
  }
}

function getSessionDuration(configDir: string): { start?: string; end?: string; duration?: string } {
  try {
    const files = fs.readdirSync(configDir)
    const archiveFiles = files.filter(f => f.match(/archive.*\.(md|json)$/i))

    if (archiveFiles.length === 0) {
      return {}
    }

    const timestamps: Date[] = []
    for (const file of archiveFiles) {
      const match = file.match(/(\d{4}-\d{2}-\d{2})/)
      if (match) {
        timestamps.push(new Date(match[1]))
      }
    }

    if (timestamps.length === 0) {
      return {}
    }

    timestamps.sort((a, b) => a.getTime() - b.getTime())
    const start = timestamps[0]
    const end = timestamps[timestamps.length - 1]
    const durationMs = end.getTime() - start.getTime()
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24))

    return {
      start: formatTimestamp(start),
      end: formatTimestamp(end),
      duration: durationDays === 1 ? '1 day' : `${durationDays} days`,
    }
  } catch {
    return {}
  }
}

function loadEvaluations(configDir: string): Evaluation[] {
  const evaluations: Evaluation[] = []
  const evalDir = path.join(configDir, 'evaluations')

  try {
    const files = fs.readdirSync(evalDir)
    for (const file of files.filter(f => f.endsWith('.md'))) {
      try {
        const content = fs.readFileSync(path.join(evalDir, file), 'utf-8')
        evaluations.push({ filename: file, content })
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return evaluations
}

function loadUserResearch(configDir: string): string[] {
  const findings: string[] = []
  const researchDir = path.join(configDir, 'user-research')

  try {
    const files = fs.readdirSync(researchDir)
    for (const file of files.filter(f => f.endsWith('.md'))) {
      try {
        const content = fs.readFileSync(path.join(researchDir, file), 'utf-8')
        const summary = content.substring(0, 300).trim()
        if (summary) {
          findings.push(`${file}: ${summary}...`)
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return findings
}

export function gatherExportData(cwd: string, includeLogs: boolean = false): ExportData {
  const configDir = path.join(cwd, '.team-config')
  const planningDir = path.join(cwd, '.planning')

  const userContext = readFileOrEmpty(path.join(configDir, 'USER-CONTEXT.md'))
  const projectContext = readFileOrEmpty(path.join(configDir, 'project-context.md'))
  const communicationLog = readFileOrEmpty(path.join(configDir, 'communication-log.md'))
  const stateContent = readFileOrEmpty(path.join(planningDir, 'STATE.md'))
  const targetUserProfile = readFileOrEmpty(path.join(configDir, 'target-user-profile.md'))

  const userContextParsed = parseUserContext(userContext)
  const projectName = userContextParsed.projectName || path.basename(cwd)
  const sessionDuration = getSessionDuration(configDir)

  const progressReport = stateContent
    ? parseStateFile(stateContent)
    : { currentPhase: '', milestonesCompleted: [], filesCreated: [], filesModified: [], stateSummary: '' }

  const exportData: ExportData = {
    metadata: {
      exportTime: new Date().toISOString(),
      version: '0.1.0',
      format: 'json',
    },
    projectSummary: {
      projectName,
      description: userContextParsed.description || '',
      techStack: userContextParsed.techStack || '',
      workflow: userContextParsed.workflow || 'gsd',
      ...sessionDuration,
    },
    progressReport,
    decisions: parseCommunicationLog(communicationLog),
    evaluations: loadEvaluations(configDir),
  }

  if (targetUserProfile) {
    const userResearch = parseTargetUserProfile(targetUserProfile)
    const researchFindings = loadUserResearch(configDir)
    exportData.userResearch = {
      ...userResearch,
      findings: [...userResearch.findings, ...researchFindings],
    }
  }

  if (includeLogs) {
    exportData.communicationLogs = communicationLog
  }

  return exportData
}

function generateMarkdown(data: ExportData): string {
  const lines: string[] = []

  lines.push(`# Crewpilot Export Report`)
  lines.push(`\n*Generated: ${formatTimestamp(new Date(data.metadata.exportTime))}*\n`)

  // Project Summary
  lines.push(`## Project Summary\n`)
  lines.push(`| Field | Value |`)
  lines.push(`|-------|-------|`)
  lines.push(`| **Project Name** | ${data.projectSummary.projectName} |`)
  lines.push(`| **Description** | ${data.projectSummary.description || 'N/A'} |`)
  lines.push(`| **Tech Stack** | ${data.projectSummary.techStack || 'N/A'} |`)
  lines.push(`| **Workflow** | ${data.projectSummary.workflow.toUpperCase()} |`)
  if (data.projectSummary.duration) {
    lines.push(`| **Session Duration** | ${data.projectSummary.duration} |`)
    lines.push(`| **Session Start** | ${data.projectSummary.sessionStart} |`)
    lines.push(`| **Session End** | ${data.projectSummary.sessionEnd} |`)
  }
  lines.push('')

  // Progress Report
  lines.push(`## Progress Report\n`)
  lines.push(`### Current Phase`)
  lines.push(`\n${data.progressReport.currentPhase || 'No phase information available.'}\n`)

  if (data.progressReport.milestonesCompleted.length > 0) {
    lines.push(`### Milestones Completed`)
    lines.push('')
    for (const milestone of data.progressReport.milestonesCompleted) {
      lines.push(`- ✅ ${milestone}`)
    }
    lines.push('')
  }

  if (data.progressReport.filesCreated.length > 0 || data.progressReport.filesModified.length > 0) {
    lines.push(`### Files Changed`)
    lines.push('')
    if (data.progressReport.filesCreated.length > 0) {
      lines.push(`**Created:**`)
      for (const file of data.progressReport.filesCreated) {
        lines.push(`- ${file}`)
      }
    }
    if (data.progressReport.filesModified.length > 0) {
      lines.push(`**Modified:**`)
      for (const file of data.progressReport.filesModified) {
        lines.push(`- ${file}`)
      }
    }
    lines.push('')
  }

  if (data.progressReport.stateSummary) {
    lines.push(`### Full State`)
    lines.push('```')
    lines.push(data.progressReport.stateSummary)
    lines.push('```')
    lines.push('')
  }

  // Decisions Made
  if (data.decisions.length > 0) {
    lines.push(`## Decisions Made\n`)
    for (let i = 0; i < data.decisions.length; i++) {
      const d = data.decisions[i]
      lines.push(`### Decision ${i + 1}: ${d.workflow} ${d.phase}`)
      lines.push(`**Timestamp:** ${d.timestamp}`)
      lines.push(`**Question:** ${d.question || 'N/A'}`)
      lines.push(`**Answer:** ${d.answer || 'N/A'}`)
      lines.push(`**Basis:** ${d.basis || 'N/A'}`)
      lines.push('')
    }
  } else {
    lines.push(`## Decisions Made\n`)
    lines.push(`No decisions recorded yet.\n`)
  }

  // User Research
  if (data.userResearch) {
    lines.push(`## User Research\n`)
    if (data.userResearch.findings.length > 0) {
      lines.push(`### Key Findings`)
      lines.push('')
      for (const finding of data.userResearch.findings) {
        lines.push(`- ${finding}`)
      }
      lines.push('')
    } else {
      lines.push(`No research findings available yet.\n`)
    }
  }

  // Evaluations
  if (data.evaluations.length > 0) {
    lines.push(`## Evaluations\n`)
    for (const evalItem of data.evaluations) {
      lines.push(`### ${evalItem.filename}`)
      lines.push('```')
      lines.push(evalItem.content.substring(0, 1000))
      if (evalItem.content.length > 1000) {
        lines.push(`\n... (${evalItem.content.length - 1000} more characters)`)
      }
      lines.push('```')
      lines.push('')
    }
  }

  // Communication Logs
  if (data.communicationLogs) {
    lines.push(`## Communication Logs\n`)
    lines.push('```markdown')
    lines.push(data.communicationLogs)
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

function generateJSON(data: ExportData): string {
  return JSON.stringify(data, null, 2)
}

export function runExport(options: ExportOptions = {}): void {
  const cwd = options.cwd ?? process.cwd()

  if (!teamConfigExists(cwd)) {
    console.log(chalk.red(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`))
    process.exit(1)
  }

  const format = options.format ?? 'markdown'
  const includeLogs = options.includeLogs ?? false

  // Generate default filename if not provided
  let outputPath = options.output
  if (!outputPath) {
    const date = new Date().toISOString().split('T')[0]
    outputPath = format === 'json'
      ? `crewpilot-export-${date}.json`
      : `crewpilot-export-${date}.md`
  }

  // Make absolute path if relative
  if (!path.isAbsolute(outputPath)) {
    outputPath = path.join(cwd, outputPath)
  }

  console.log(chalk.blue('Gathering export data...'))

  const data = gatherExportData(cwd, includeLogs)

  // Update metadata format
  data.metadata.format = format

  let content: string
  if (format === 'json') {
    content = generateJSON(data)
  } else {
    content = generateMarkdown(data)
  }

  try {
    fs.writeFileSync(outputPath, content, 'utf-8')
    console.log(chalk.green(`✓ Export saved to: ${outputPath}`))
    console.log(chalk.gray(`  Format: ${format}`))
    console.log(chalk.gray(`  Decisions: ${data.decisions.length}`))
    console.log(chalk.gray(`  Evaluations: ${data.evaluations.length}`))
    if (data.userResearch) {
      console.log(chalk.gray(`  User Research: ${data.userResearch.findings.length} findings`))
    }
    if (includeLogs) {
      console.log(chalk.gray(`  Communication logs: included`))
    }
  } catch (err: any) {
    console.error(chalk.red(`Failed to write export: ${err.message}`))
    process.exit(1)
  }
}
