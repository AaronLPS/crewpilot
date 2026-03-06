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
  sessionExists: vi.fn().mockReturnValue(true),
  sendKeys: vi.fn(),
  sendEnter: vi.fn(),
  sleepMs: vi.fn(),
  listPanes: vi.fn(),
}))

import { sendKeys, sendEnter, sleepMs, listPanes } from '../../tmux.js'
import { runStopRunner } from '../../commands/stop-runner.js'

const mockSendKeys = vi.mocked(sendKeys)
const mockSendEnter = vi.mocked(sendEnter)
const mockSleepMs = vi.mocked(sleepMs)
const mockListPanes = vi.mocked(listPanes)

describe('runStopRunner', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-stopr-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '%5\n', 'utf-8')
    vi.clearAllMocks()
    mockListPanes.mockReturnValue([{ id: '%5', active: true, command: 'claude' }])
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('sends /exit to the runner pane', () => {
    runStopRunner({ cwd: tmpDir })
    expect(mockSendKeys).toHaveBeenCalledWith('%5', '/exit')
    expect(mockSendEnter).toHaveBeenCalled()
  })

  it('clears runner-pane-id.txt after stopping', () => {
    runStopRunner({ cwd: tmpDir })
    const content = fs.readFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), 'utf-8')
    expect(content.trim()).toBe('')
  })

  it('removes runner lock file', () => {
    const lockPath = path.join(tmpDir, '.team-config', '.runner-lock')
    fs.writeFileSync(lockPath, '{}')
    runStopRunner({ cwd: tmpDir })
    expect(fs.existsSync(lockPath)).toBe(false)
  })

  it('throws if no runner pane ID is recorded', () => {
    fs.writeFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), '', 'utf-8')
    expect(() => runStopRunner({ cwd: tmpDir })).toThrow(/no active runner/)
  })
})
