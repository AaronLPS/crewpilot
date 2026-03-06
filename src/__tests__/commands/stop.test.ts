import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  killSession: vi.fn(),
  listPanes: vi.fn(),
  sendKeys: vi.fn(),
  sendEnter: vi.fn(),
  sleepMs: vi.fn(),
}))

import { sessionExists, killSession, listPanes, sendKeys, sendEnter } from '../../tmux.js'
import { runStop } from '../../commands/stop.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockKillSession = vi.mocked(killSession)
const mockListPanes = vi.mocked(listPanes)
const mockSendKeys = vi.mocked(sendKeys)

describe('runStop', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-stop-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '', 'utf-8')
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('errors if no active session', () => {
    mockSessionExists.mockReturnValue(false)
    expect(() => runStop(tmpDir)).toThrow(/No active/)
  })

  it('sends /exit to runner panes and kills session', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
      { id: '%1', active: false, command: 'claude' },
    ])
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'runner-pane-id.txt'),
      '%1',
      'utf-8'
    )

    runStop(tmpDir)

    expect(mockSendKeys).toHaveBeenCalledWith('%1', '/exit')
    expect(mockKillSession).toHaveBeenCalledWith('crewpilot-testapp')
  })

  it('skips runner pane IDs not in the crewpilot session', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
    ])
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'runner-pane-id.txt'),
      '%99',
      'utf-8'
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    runStop(tmpDir)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not in session'))
    expect(mockSendKeys).not.toHaveBeenCalledWith('%99', '/exit')
    warnSpy.mockRestore()
  })

  it('handles missing runner-pane-id.txt gracefully', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
    ])
    fs.unlinkSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'))

    runStop(tmpDir)

    expect(mockKillSession).toHaveBeenCalledWith('crewpilot-testapp')
  })

  it('skips invalid pane IDs with warning', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
      { id: '%1', active: false, command: 'claude' },
      { id: '%2', active: false, command: 'claude' },
    ])
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'runner-pane-id.txt'),
      '%1\n; rm -rf /\n%2\n',
      'utf-8'
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    runStop(tmpDir)

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping invalid pane ID'))
    // Ensure the injected string was never passed to sendKeys
    for (const call of mockSendKeys.mock.calls) {
      expect(call[0]).not.toContain('rm -rf')
    }
    warnSpy.mockRestore()
  })

  it('removes team-lead and runner lockfiles on stop', () => {
    const configDir = path.join(tmpDir, '.team-config')
    fs.writeFileSync(path.join(configDir, '.team-lead-lock'), '{"paneId":"%0","pid":1234,"startedAt":"2026-01-01T00:00:00.000Z"}')
    fs.writeFileSync(path.join(configDir, '.runner-lock'), '{"paneId":"%5","pid":5678,"startedAt":"2026-01-01T00:00:00.000Z"}')

    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([])

    runStop(tmpDir)

    expect(fs.existsSync(path.join(configDir, '.team-lead-lock'))).toBe(false)
    expect(fs.existsSync(path.join(configDir, '.runner-lock'))).toBe(false)
  })

  it('kills session even without runner panes', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
    ])

    runStop(tmpDir)

    expect(mockKillSession).toHaveBeenCalledWith('crewpilot-testapp')
  })
})
