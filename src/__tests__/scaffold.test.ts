import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scaffoldTeamConfig, teamConfigExists, appendClaudeMd } from '../scaffold.js'

describe('scaffoldTeamConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates .team-config directory with all expected files', () => {
    scaffoldTeamConfig(tmpDir, {
      projectName: 'TestApp',
      description: 'A test application',
      userDescription: 'Developers aged 25-40',
      techStack: 'TypeScript + React',
      workflow: 'gsd',
    })

    const configDir = path.join(tmpDir, '.team-config')
    expect(fs.existsSync(configDir)).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'team-lead-persona.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'target-user-profile.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'USER-CONTEXT.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'project-context.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'session-recovery.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'state-snapshot.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'communication-log.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'human-inbox.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'human-directives.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'needs-human-decision.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'runner-pane-id.txt'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'user-research'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'evaluations'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'archives'))).toBe(true)
  })

  it('writes user description into target-user-profile.md', () => {
    scaffoldTeamConfig(tmpDir, {
      projectName: 'TestApp',
      description: 'A test app',
      userDescription: 'Power users who love shortcuts',
      techStack: 'Rust',
      workflow: 'superpowers',
    })

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'target-user-profile.md'),
      'utf-8'
    )
    expect(content).toContain('Power users who love shortcuts')
  })

  it('writes project info into USER-CONTEXT.md', () => {
    scaffoldTeamConfig(tmpDir, {
      projectName: 'MyProject',
      description: 'My cool project',
      userDescription: 'Everyone',
      techStack: 'Python + FastAPI',
      workflow: 'gsd',
    })

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
    expect(content).toContain('MyProject')
    expect(content).toContain('My cool project')
    expect(content).toContain('Python + FastAPI')
    expect(content).toContain('gsd')
  })
})

describe('teamConfigExists', () => {
  it('returns true when .team-config exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-exists-'))
    fs.mkdirSync(path.join(tmpDir, '.team-config'))
    expect(teamConfigExists(tmpDir)).toBe(true)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns false when .team-config does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-noexist-'))
    expect(teamConfigExists(tmpDir)).toBe(false)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})

describe('appendClaudeMd', () => {
  it('creates CLAUDE.md if it does not exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-claude-'))
    appendClaudeMd(tmpDir, '# Team Lead Config\n')
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')
    expect(content).toBe('# Team Lead Config\n')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('appends to existing CLAUDE.md', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-claude2-'))
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Existing\n', 'utf-8')
    appendClaudeMd(tmpDir, '\n# Added\n')
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8')
    expect(content).toBe('# Existing\n\n# Added\n')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
