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
})
