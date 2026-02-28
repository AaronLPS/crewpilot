import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../scaffold.js', () => ({
  teamConfigExists: vi.fn().mockReturnValue(true),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  createWindow: vi.fn(),
  sendKeys: vi.fn(),
  sendEnter: vi.fn(),
  sendTextInput: vi.fn(),
  sleepMs: vi.fn(),
  listPanes: vi.fn().mockReturnValue([]),
}))

import { sessionExists, createWindow, sendKeys, sendEnter, sendTextInput, sleepMs, listPanes } from '../../tmux.js'
import { runLaunchRunner } from '../../commands/launch-runner.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockCreateWindow = vi.mocked(createWindow)
const mockSendKeys = vi.mocked(sendKeys)
const mockSendEnter = vi.mocked(sendEnter)
const mockSendTextInput = vi.mocked(sendTextInput)
const mockSleepMs = vi.mocked(sleepMs)
const mockListPanes = vi.mocked(listPanes)

describe('runLaunchRunner', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-launch-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '', 'utf-8')
    vi.clearAllMocks()
    mockSessionExists.mockReturnValue(true)
    mockCreateWindow.mockReturnValue('%5')
    mockListPanes.mockReturnValue([])
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('errors if no .team-config found', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-empty-'))
    const { teamConfigExists } = await import('../../scaffold.js')
    vi.mocked(teamConfigExists).mockReturnValueOnce(false)
    await expect(runLaunchRunner({ cwd: emptyDir })).rejects.toThrow(/crewpilot init/)
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })

  it('errors if session is not active', async () => {
    mockSessionExists.mockReturnValue(false)
    await expect(runLaunchRunner({ cwd: tmpDir })).rejects.toThrow(/not active/)
  })

  it('creates a window and launches claude with gsd workflow', async () => {
    await runLaunchRunner({ cwd: tmpDir, workflow: 'gsd' })
    expect(mockCreateWindow).toHaveBeenCalledWith('crewpilot-testapp')
    expect(mockSendKeys).toHaveBeenCalled()
    // Verify runner-pane-id.txt was written
    const paneContent = fs.readFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), 'utf-8')
    expect(paneContent.trim()).toBe('%5')
  })

  it('creates a window and launches claude with superpowers workflow', async () => {
    await runLaunchRunner({ cwd: tmpDir, workflow: 'superpowers', prompt: 'Build a todo app' })
    expect(mockCreateWindow).toHaveBeenCalled()
    expect(mockSendTextInput).toHaveBeenCalled()
  })

  it('rejects if runner pane already exists and is alive', async () => {
    fs.writeFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), '%3\n', 'utf-8')
    mockListPanes.mockReturnValue([{ id: '%3', active: true, command: 'claude' }])
    await expect(runLaunchRunner({ cwd: tmpDir })).rejects.toThrow(/already running/)
  })

  it('proceeds if runner pane file exists but pane is dead', async () => {
    fs.writeFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), '%3\n', 'utf-8')
    mockListPanes.mockReturnValue([]) // pane not in list = dead
    await runLaunchRunner({ cwd: tmpDir, workflow: 'gsd' })
    expect(mockCreateWindow).toHaveBeenCalled()
  })

  it('writes runner lock file', async () => {
    await runLaunchRunner({ cwd: tmpDir, workflow: 'gsd' })
    const lockPath = path.join(tmpDir, '.team-config', '.runner-lock')
    expect(fs.existsSync(lockPath)).toBe(true)
    const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))
    expect(lockData.paneId).toBe('%5')
  })
})
