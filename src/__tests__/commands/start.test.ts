import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  createSession: vi.fn(),
  sendKeys: vi.fn(),
  sendEnter: vi.fn(),
  sendTextInput: vi.fn(),
  attachSession: vi.fn(),
  sleepMs: vi.fn(),
}))

import { sessionExists, createSession, sendKeys, sendTextInput, attachSession } from '../../tmux.js'
import { runStart } from '../../commands/start.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockCreateSession = vi.mocked(createSession)
const mockSendKeys = vi.mocked(sendKeys)
const mockSendTextInput = vi.mocked(sendTextInput)
const mockAttachSession = vi.mocked(attachSession)

describe('runStart', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-start-test-'))
    vi.clearAllMocks()
    mockSessionExists.mockReturnValue(false)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('errors if .team-config does not exist', async () => {
    await expect(runStart({ cwd: tmpDir })).rejects.toThrow(/crewpilot init/)
  })

  it('creates tmux session and launches Claude Code', async () => {
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )

    await runStart({ cwd: tmpDir, noAttach: true })

    expect(mockCreateSession).toHaveBeenCalledWith('crewpilot-testapp', tmpDir)
    expect(mockSendKeys).toHaveBeenCalled()
    expect(mockSendTextInput).toHaveBeenCalled()
  })

  it('does not attach when --no-attach is set', async () => {
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )

    await runStart({ cwd: tmpDir, noAttach: true })

    expect(mockAttachSession).not.toHaveBeenCalled()
  })
})
