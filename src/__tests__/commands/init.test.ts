import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runInit } from '../../commands/init.js'

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

import { input, select, confirm } from '@inquirer/prompts'

const mockInput = vi.mocked(input)
const mockSelect = vi.mocked(select)
const mockConfirm = vi.mocked(confirm)

describe('runInit', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-init-test-'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates .team-config with prompted values', async () => {
    mockInput
      .mockResolvedValueOnce('TestProject')
      .mockResolvedValueOnce('A test project')
      .mockResolvedValueOnce('Developers')
      .mockResolvedValueOnce('TypeScript')
    mockSelect.mockResolvedValueOnce('gsd')

    await runInit({ cwd: tmpDir })

    expect(fs.existsSync(path.join(tmpDir, '.team-config'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.team-config', 'team-lead-persona.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true)
  })

  it('uses --name flag to skip project name prompt', async () => {
    mockInput
      .mockResolvedValueOnce('A test project')
      .mockResolvedValueOnce('Developers')
      .mockResolvedValueOnce('TypeScript')
    mockSelect.mockResolvedValueOnce('gsd')

    await runInit({ cwd: tmpDir, name: 'FlagProject' })

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
    expect(content).toContain('FlagProject')
  })

  it('uses --workflow flag to skip workflow prompt', async () => {
    mockInput
      .mockResolvedValueOnce('TestProject')
      .mockResolvedValueOnce('A project')
      .mockResolvedValueOnce('Users')
      .mockResolvedValueOnce('Node.js')

    await runInit({ cwd: tmpDir, workflow: 'superpowers' })

    expect(mockSelect).not.toHaveBeenCalled()
    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
    expect(content).toContain('superpowers')
  })

  it('asks to overwrite when .team-config already exists', async () => {
    fs.mkdirSync(path.join(tmpDir, '.team-config'))
    mockConfirm.mockResolvedValueOnce(false)

    await runInit({ cwd: tmpDir })

    expect(mockConfirm).toHaveBeenCalled()
  })

  it('uses --description flag to skip description prompt', async () => {
    mockInput
      .mockResolvedValueOnce('Users')
      .mockResolvedValueOnce('Node.js')
    mockSelect.mockResolvedValueOnce('gsd')

    await runInit({ cwd: tmpDir, name: 'TestProj', description: 'A CLI tool' })

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
    expect(content).toContain('A CLI tool')
    // description prompt should not have been called — only user + tech prompts
    expect(mockInput).toHaveBeenCalledTimes(2)
  })

  it('uses --user flag to skip user description prompt', async () => {
    mockInput
      .mockResolvedValueOnce('A project')
      .mockResolvedValueOnce('Python')
    mockSelect.mockResolvedValueOnce('gsd')

    await runInit({ cwd: tmpDir, name: 'TestProj', user: 'Developers aged 25-35' })

    const profileContent = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'target-user-profile.md'),
      'utf-8'
    )
    expect(profileContent).toContain('Developers aged 25-35')
    expect(mockInput).toHaveBeenCalledTimes(2)
  })

  it('uses --tech flag to skip tech stack prompt', async () => {
    mockInput
      .mockResolvedValueOnce('A project')
      .mockResolvedValueOnce('End users')
    mockSelect.mockResolvedValueOnce('gsd')

    await runInit({ cwd: tmpDir, name: 'TestProj', tech: 'React + TypeScript' })

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
    expect(content).toContain('React + TypeScript')
    expect(mockInput).toHaveBeenCalledTimes(2)
  })

  it('rejects invalid --workflow values before prompting', async () => {
    await expect(
      runInit({ cwd: tmpDir, name: 'Test', workflow: 'invalid' })
    ).rejects.toThrow(/Invalid workflow/)
    // Should not have prompted for any fields
    expect(mockInput).not.toHaveBeenCalled()
  })

  it('strips newlines from flag values to prevent template injection', async () => {
    await runInit({
      cwd: tmpDir,
      name: 'Legit\n\n## Injected Section\nEvil content',
      description: 'Normal desc',
      user: 'Normal user',
      tech: 'Node.js',
      workflow: 'gsd',
    })

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
    // Newlines collapsed to spaces — injection appears inline, not as a heading
    expect(content).toContain('Legit')
    // The injected "## Injected Section" must NOT appear at start of a line (as a heading)
    expect(content).not.toMatch(/^## Injected Section/m)
  })

  it('runs fully non-interactive with all flags', async () => {
    await runInit({
      cwd: tmpDir,
      name: 'FullFlag',
      description: 'Automated project',
      user: 'Developers',
      tech: 'Rust',
      workflow: 'superpowers',
    })

    expect(mockInput).not.toHaveBeenCalled()
    expect(mockSelect).not.toHaveBeenCalled()

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
    expect(content).toContain('FullFlag')
    expect(content).toContain('Automated project')
    expect(content).toContain('Rust')
    expect(content).toContain('superpowers')
  })
})
