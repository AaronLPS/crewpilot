import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  listPanes: vi.fn(),
}))

import { gatherExportData, runExport } from '../../commands/export.js'

describe('gatherExportData', () => {
  let tmpDir: string
  let configDir: string
  let planningDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-export-test-'))
    configDir = path.join(tmpDir, '.team-config')
    planningDir = path.join(tmpDir, '.planning')
    fs.mkdirSync(configDir, { recursive: true })
    fs.mkdirSync(planningDir, { recursive: true })
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('extracts project summary from USER-CONTEXT.md', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
MyTestApp

## Description
A test application

## Tech Stack / Constraints
Node.js, TypeScript

## Preferred Workflow
superpowers`,
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.projectSummary.projectName).toBe('MyTestApp')
    expect(data.projectSummary.description).toBe('A test application')
    expect(data.projectSummary.techStack).toBe('Node.js, TypeScript')
    expect(data.projectSummary.workflow).toBe('superpowers')
  })

  it('defaults to gsd workflow when not specified', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.projectSummary.workflow).toBe('gsd')
  })

  it('uses directory name when project name not found', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '',
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.projectSummary.projectName).toBe(path.basename(tmpDir))
  })

  it('parses communication log into decisions', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )
    fs.writeFileSync(
      path.join(configDir, 'communication-log.md'),
      `## 2024-01-15 10:00 | GSD | Phase 2
Q: "Should we use PostgreSQL or SQLite?"
A: (User Proxy) "Let's use PostgreSQL for production"
Basis: Team discussion

## 2024-01-15 11:00 | Superpowers | Phase 3
Q: "API design approach?"
A: (User Proxy) "REST API"
Basis: Simplicity`,
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.decisions).toHaveLength(2)
    expect(data.decisions[0].timestamp).toBe('2024-01-15 10:00')
    expect(data.decisions[0].question).toBe('Should we use PostgreSQL or SQLite?')
    expect(data.decisions[0].answer).toBe("Let's use PostgreSQL for production")
    expect(data.decisions[0].workflow).toBe('GSD')
    expect(data.decisions[0].phase).toBe('Phase 2')
  })

  it('handles empty communication log', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )
    fs.writeFileSync(
      path.join(configDir, 'communication-log.md'),
      '',
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.decisions).toEqual([])
  })

  it('parses STATE.md into progress report', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      `Current Phase: GSD Execute Phase 3

Milestones:
1. Setup project structure
2. Configure build pipeline

Files Created:
- src/index.ts
- package.json

Files Modified:
- tsconfig.json`,
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.progressReport.currentPhase).toContain('Phase 3')
    expect(data.progressReport.stateSummary).toContain('Setup project structure')
  })

  it('includes communication logs when requested', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )
    fs.writeFileSync(
      path.join(configDir, 'communication-log.md'),
      'Communication log content here',
      'utf-8'
    )

    const dataWithLogs = gatherExportData(tmpDir, true)
    const dataWithoutLogs = gatherExportData(tmpDir, false)

    expect(dataWithLogs.communicationLogs).toBe('Communication log content here')
    expect(dataWithoutLogs.communicationLogs).toBeUndefined()
  })

  it('includes metadata with export time', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.metadata.exportTime).toBeDefined()
    expect(data.metadata.version).toBe('0.1.0')
    expect(data.metadata.format).toBe('json')
  })

  it('loads evaluations from evaluations directory', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )

    const evalDir = path.join(configDir, 'evaluations')
    fs.mkdirSync(evalDir, { recursive: true })
    fs.writeFileSync(
      path.join(evalDir, 'sprint1.md'),
      'Sprint 1 evaluation: Great progress!',
      'utf-8'
    )
    fs.writeFileSync(
      path.join(evalDir, 'sprint2.md'),
      'Sprint 2 evaluation: Code review feedback',
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.evaluations).toHaveLength(2)
    expect(data.evaluations.some(e => e.filename === 'sprint1.md')).toBe(true)
    expect(data.evaluations.some(e => e.content.includes('Great progress'))).toBe(true)
  })

  it('handles missing evaluations directory gracefully', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.evaluations).toEqual([])
  })

  it('parses target user profile when available', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      `## Core Needs
1. Fast performance
2. Simple UI

## Pain Points
1. Current tools are slow

## Research Findings
- Interviewed 5 users`,
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.userResearch).toBeDefined()
    expect(data.userResearch?.findings).toContain('Fast performance')
    expect(data.userResearch?.findings).toContain('Simple UI')
    expect(data.userResearch?.findings).toContain('Current tools are slow')
    expect(data.userResearch?.findings).toContain('Interviewed 5 users')
  })

  it('loads user research from user-research directory', () => {
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '# Target User Profile',
      'utf-8'
    )

    const researchDir = path.join(configDir, 'user-research')
    fs.mkdirSync(researchDir, { recursive: true })
    fs.writeFileSync(
      path.join(researchDir, 'interview1.md'),
      'User interview notes about pain points',
      'utf-8'
    )

    const data = gatherExportData(tmpDir)

    expect(data.userResearch?.findings.some(f => f.includes('interview1.md'))).toBe(true)
  })
})

describe('runExport', () => {
  let tmpDir: string
  let configDir: string
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-export-run-test-'))
    configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      `## Project Name
TestApp`,
      'utf-8'
    )
    process.chdir(tmpDir)
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates markdown export by default', () => {
    runExport({})

    const files = fs.readdirSync(tmpDir)
    const exportFile = files.find(f => f.startsWith('crewpilot-export-') && f.endsWith('.md'))

    expect(exportFile).toBeDefined()
  })

  it('creates JSON export when format is json', () => {
    runExport({ format: 'json' })

    const files = fs.readdirSync(tmpDir)
    const exportFile = files.find(f => f.startsWith('crewpilot-export-') && f.endsWith('.json'))

    expect(exportFile).toBeDefined()

    const content = fs.readFileSync(path.join(tmpDir, exportFile!), 'utf-8')
    const data = JSON.parse(content)
    expect(data.projectSummary.projectName).toBe('TestApp')
    expect(data.metadata.format).toBe('json')
  })

  it('uses custom output path', () => {
    runExport({ output: 'my-report.md' })

    expect(fs.existsSync(path.join(tmpDir, 'my-report.md'))).toBe(true)
  })

  it('supports absolute output paths', () => {
    const absolutePath = path.join(os.tmpdir(), 'absolute-export-test.md')
    runExport({ output: absolutePath })

    expect(fs.existsSync(absolutePath)).toBe(true)
    fs.unlinkSync(absolutePath)
  })

  it('exits with error when .team-config does not exist', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    const noConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-config-'))
    process.chdir(noConfigDir)

    expect(() => runExport({})).toThrow('process.exit called')

    exitSpy.mockRestore()
    fs.rmSync(noConfigDir, { recursive: true, force: true })
  })
})
