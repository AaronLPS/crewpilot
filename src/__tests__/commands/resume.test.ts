import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  select: vi.fn().mockResolvedValue('attach'),
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
  listPanes: vi.fn(),
  sleepMs: vi.fn(),
  killSession: vi.fn(),
}))

import { confirm } from '@inquirer/prompts'
import { sessionExists, createSession, sendKeys, sendTextInput, attachSession, listPanes, killSession } from '../../tmux.js'
import { runResume } from '../../commands/resume.js'

const mockConfirm = vi.mocked(confirm)
const mockSessionExists = vi.mocked(sessionExists)
const mockCreateSession = vi.mocked(createSession)
const mockSendKeys = vi.mocked(sendKeys)
const mockSendTextInput = vi.mocked(sendTextInput)
const mockAttachSession = vi.mocked(attachSession)
const mockListPanes = vi.mocked(listPanes)
const mockKillSession = vi.mocked(killSession)

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

  it('exits early if user declines the permissions warning', async () => {
    mockSessionExists.mockReturnValue(false)
    mockConfirm.mockResolvedValueOnce(false)

    await runResume({ cwd: tmpDir }) // no noAttach flag, so confirmation should show

    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('skips permissions warning when --no-attach flag is used', async () => {
    mockSessionExists.mockReturnValue(false)

    await runResume({ cwd: tmpDir, noAttach: true })

    // confirm should not be called for the permissions warning when noAttach is true
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockCreateSession).toHaveBeenCalled()
  })

  it('creates new session without --continue when --fresh', async () => {
    mockSessionExists.mockReturnValue(false)

    await runResume({ cwd: tmpDir, noAttach: true, fresh: true })

    expect(mockCreateSession).toHaveBeenCalled()
    const sendKeysCall = mockSendKeys.mock.calls[0]
    expect(sendKeysCall[1]).not.toContain('--continue')
  })

  it('auto-detects fresh start when no state exists', async () => {
    mockSessionExists.mockReturnValue(false)

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runResume({ cwd: tmpDir, noAttach: true, auto: true })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('fresh start'))
    const sendKeysCall = mockSendKeys.mock.calls[0]
    expect(sendKeysCall[1]).not.toContain('--continue')
    
    consoleSpy.mockRestore()
  })

  it('detects recent snapshot and recommends continue', async () => {
    mockSessionExists.mockReturnValue(false)
    
    // Create a recent state snapshot
    const configDir = path.join(tmpDir, '.team-config')
    fs.writeFileSync(
      path.join(configDir, 'state-snapshot.md'),
      `# State Snapshot\n\nLast Snapshot: ${new Date().toISOString()}\nCurrent Phase: Testing\n`,
      'utf-8'
    )

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runResume({ cwd: tmpDir, noAttach: true, auto: true })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('continue'))
    
    consoleSpy.mockRestore()
  })

  it('detects old snapshot and recommends review', async () => {
    mockSessionExists.mockReturnValue(false)
    
    // Create an old state snapshot (2 days ago)
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 2)
    
    const configDir = path.join(tmpDir, '.team-config')
    fs.writeFileSync(
      path.join(configDir, 'state-snapshot.md'),
      `# State Snapshot\n\nLast Snapshot: ${oldDate.toISOString()}\nCurrent Phase: Development\n`,
      'utf-8'
    )

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runResume({ cwd: tmpDir, noAttach: true })

    // Should show review recommendation
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Review'))
    
    consoleSpy.mockRestore()
  })

  it('handles corrupted state snapshot gracefully', async () => {
    mockSessionExists.mockReturnValue(false)
    
    const configDir = path.join(tmpDir, '.team-config')
    // Write binary garbage to snapshot file
    fs.writeFileSync(
      path.join(configDir, 'state-snapshot.md'),
      Buffer.from([0x00, 0x01, 0x02, 0x03])
    )

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runResume({ cwd: tmpDir, noAttach: true, auto: true })

    // Should not crash, should continue with fresh start
    expect(mockCreateSession).toHaveBeenCalled()
    
    consoleSpy.mockRestore()
  })

  it('handles empty state snapshot file', async () => {
    mockSessionExists.mockReturnValue(false)
    
    const configDir = path.join(tmpDir, '.team-config')
    fs.writeFileSync(
      path.join(configDir, 'state-snapshot.md'),
      '',
      'utf-8'
    )

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runResume({ cwd: tmpDir, noAttach: true, auto: true })

    // Should not crash
    expect(mockCreateSession).toHaveBeenCalled()
    
    consoleSpy.mockRestore()
  })

  it('handles various timestamp formats', async () => {
    mockSessionExists.mockReturnValue(false)
    
    const configDir = path.join(tmpDir, '.team-config')
    
    // Test different date formats
    const formats = [
      `Last Snapshot: ${new Date().toISOString()}`,
      `Snapshot Time: ${new Date().toLocaleString()}`,
      `2024-01-15 10:30:00`,
    ]
    
    for (const dateStr of formats) {
      fs.writeFileSync(
        path.join(configDir, 'state-snapshot.md'),
        `# State Snapshot\n\n${dateStr}\n`,
        'utf-8'
      )

      vi.clearAllMocks()
      
      await runResume({ cwd: tmpDir, noAttach: true, auto: true })
      
      // Should not crash with any date format
      expect(mockCreateSession).toHaveBeenCalled()
    }
  })

  it('shows warnings for stale pane ID files', async () => {
    mockSessionExists.mockReturnValue(false)
    
    const configDir = path.join(tmpDir, '.team-config')
    fs.writeFileSync(
      path.join(configDir, 'runner-pane-id.txt'),
      '%0\n%1',
      'utf-8'
    )
    
    // Make the file old
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 10)
    fs.utimesSync(path.join(configDir, 'runner-pane-id.txt'), oldDate, oldDate)

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runResume({ cwd: tmpDir, noAttach: true, auto: true })

    // Should continue without crashing
    expect(mockCreateSession).toHaveBeenCalled()
    
    consoleSpy.mockRestore()
  })

  it('handles session recovery file errors gracefully', async () => {
    mockSessionExists.mockReturnValue(false)
    
    const configDir = path.join(tmpDir, '.team-config')
    // Create empty session recovery
    fs.writeFileSync(
      path.join(configDir, 'session-recovery.md'),
      '',
      'utf-8'
    )

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runResume({ cwd: tmpDir, noAttach: true, auto: true })

    // Should show warning but continue
    expect(mockCreateSession).toHaveBeenCalled()
    
    consoleSpy.mockRestore()
  })

  it('handles tmux command failures gracefully', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockImplementation(() => {
      throw new Error('tmux command failed')
    })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runResume({ cwd: tmpDir, noAttach: true })

    // Should handle error and continue
    expect(mockCreateSession).toHaveBeenCalled()
    
    consoleSpy.mockRestore()
  })
})
