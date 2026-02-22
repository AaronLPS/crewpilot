import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

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
  listPanes: vi.fn(),
  sleepMs: vi.fn(),
}))

import { sessionExists, createSession, sendKeys, sendTextInput, attachSession, listPanes } from '../../tmux.js'
import { runResume } from '../../commands/resume.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockCreateSession = vi.mocked(createSession)
const mockSendKeys = vi.mocked(sendKeys)
const mockSendTextInput = vi.mocked(sendTextInput)
const mockAttachSession = vi.mocked(attachSession)
const mockListPanes = vi.mocked(listPanes)

describe('runResume', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-resume-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('attaches to existing session if it has live panes', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])

    await runResume({ cwd: tmpDir })

    expect(mockAttachSession).toHaveBeenCalledWith('crewpilot-testapp')
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('creates new session with --continue flag by default', async () => {
    mockSessionExists.mockReturnValue(false)

    await runResume({ cwd: tmpDir, noAttach: true })

    expect(mockCreateSession).toHaveBeenCalled()
    const sendKeysCall = mockSendKeys.mock.calls[0]
    expect(sendKeysCall[1]).toContain('--continue')
  })

  it('creates new session without --continue when --fresh', async () => {
    mockSessionExists.mockReturnValue(false)

    await runResume({ cwd: tmpDir, noAttach: true, fresh: true })

    expect(mockCreateSession).toHaveBeenCalled()
    const sendKeysCall = mockSendKeys.mock.calls[0]
    expect(sendKeysCall[1]).not.toContain('--continue')
  })
})
