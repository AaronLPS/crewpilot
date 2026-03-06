import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../scaffold.js', () => ({
  teamConfigExists: vi.fn().mockReturnValue(true),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  listPanes: vi.fn(),
  capturePaneContent: vi.fn(),
  sleepMs: vi.fn(),
}))

import { teamConfigExists } from '../../scaffold.js'
import { sessionExists, listPanes, capturePaneContent, sleepMs } from '../../tmux.js'
import { runWatch, runCheck } from '../../commands/watch.js'

const mockTeamConfigExists = vi.mocked(teamConfigExists)
const mockSessionExists = vi.mocked(sessionExists)
const mockListPanes = vi.mocked(listPanes)
const mockCapturePaneContent = vi.mocked(capturePaneContent)
const mockSleepMs = vi.mocked(sleepMs)

describe('runCheck', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-check-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    vi.clearAllMocks()
    mockTeamConfigExists.mockReturnValue(true)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('shows status for working runner', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('⏳ Thinking about the problem...\n❯')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runCheck(tmpDir)
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Working'))
    consoleSpy.mockRestore()
  })

  it('shows status for idle runner', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('Task complete.\n❯')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runCheck(tmpDir)
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Idle'))
    consoleSpy.mockRestore()
  })

  it('shows status for question state', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('❯ 1. Option A\n❯ 2. Option B\nEnter to select')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runCheck(tmpDir)
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Question'))
    consoleSpy.mockRestore()
  })

  it('shows status for error state', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('Error: Something went wrong\nTraceback:')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runCheck(tmpDir)
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error'))
    consoleSpy.mockRestore()
  })

  it('shows status for stopped runner', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'bash' }])
    mockCapturePaneContent.mockReturnValue('bash-5.1$')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runCheck(tmpDir)
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Stopped'))
    consoleSpy.mockRestore()
  })

  it('returns early if no team-config exists', () => {
    mockTeamConfigExists.mockReturnValue(false)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runCheck(tmpDir)
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No .team-config/ found'))
    consoleSpy.mockRestore()
  })

  it('returns early if session is not active', () => {
    mockSessionExists.mockReturnValue(false)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runCheck(tmpDir)
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not active'))
    consoleSpy.mockRestore()
  })

  it('shows multiple panes', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
      { id: '%1', active: false, command: 'claude' },
    ])
    mockCapturePaneContent.mockReturnValue('❯')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runCheck(tmpDir)
    
    // Should show both panes
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('%0'))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('%1'))
    consoleSpy.mockRestore()
  })

  it('handles tmux errors gracefully', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockImplementation(() => {
      throw new Error('tmux error')
    })
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    // Should not throw
    expect(() => runCheck(tmpDir)).not.toThrow()
    
    consoleSpy.mockRestore()
  })
})

describe('runWatch', () => {
  let tmpDir: string
  let logFile: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-watch-test-'))
    logFile = path.join(tmpDir, 'notifications.log')
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    vi.clearAllMocks()
    mockTeamConfigExists.mockReturnValue(true)
    mockSleepMs.mockImplementation(() => {
      throw new Error('STOP_LOOP')
    })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns early if no team-config exists', async () => {
    mockTeamConfigExists.mockReturnValue(false)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    await runWatch({ cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No .team-config/ found'))
    consoleSpy.mockRestore()
  })

  it('returns early if session is not active', async () => {
    mockSessionExists.mockReturnValue(false)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    await runWatch({ cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not active'))
    consoleSpy.mockRestore()
  })

  it('shows runner status header', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('❯')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})
    
    try {
      await runWatch({ cwd: tmpDir, once: true })
    } catch {
      // Expected
    }
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Crewpilot Watch'))
    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('runs once with --once flag', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('❯')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})
    
    // Should exit normally with once: true
    await runWatch({ cwd: tmpDir, once: true })
    
    expect(consoleSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('supports desktop notification method', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('❯')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})
    
    await runWatch({ cwd: tmpDir, once: true, notify: 'desktop' })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('desktop'))
    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('supports log notification method', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('❯')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})
    
    await runWatch({ cwd: tmpDir, once: true, notify: 'log', logFile })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('log'))
    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('supports both notification methods', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('❯')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})
    
    await runWatch({ cwd: tmpDir, once: true, notify: 'both', logFile })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('both'))
    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('logs to file when using log method', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('❯ 1. Option\nEnter to select')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})
    
    await runWatch({ cwd: tmpDir, once: true, notify: 'log', logFile })
    
    // Check if log file was created
    expect(fs.existsSync(logFile)).toBe(true)
    const logContent = fs.readFileSync(logFile, 'utf-8')
    expect(logContent).toContain('Watch started')
    
    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('supports rate limiting option', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('❯')
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})
    
    await runWatch({ cwd: tmpDir, once: true, notify: 'desktop', rateLimit: 10 })
    
    // Should show rate limit in output
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('10m'))
    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('detects state changes correctly', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    
    // First call - working
    mockCapturePaneContent.mockReturnValueOnce('⏳ Working...\n')
    // Second call - would be idle but we're using once
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})
    
    await runWatch({ cwd: tmpDir, once: true })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Working'))
    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('handles pane capture errors gracefully', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockImplementation(() => {
      throw new Error('capture failed')
    })
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})
    
    // Should not throw
    await runWatch({ cwd: tmpDir, once: true })
    
    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('detects error state with confidence', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('Error: Failed to compile\nTraceback: line 42')

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})

    await runWatch({ cwd: tmpDir, once: true })

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error'))
    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})

describe('state file writing', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-watch-state-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '%5\n', 'utf-8')
    vi.clearAllMocks()
    mockTeamConfigExists.mockReturnValue(true)
    mockSessionExists.mockReturnValue(true)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes runner-state.json during watch cycle', async () => {
    mockListPanes.mockReturnValue([{ id: '%5', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('⏳ Thinking...\n❯')

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})

    await runWatch({ cwd: tmpDir, once: true, notify: 'log' })

    const statePath = path.join(tmpDir, '.team-config', 'runner-state.json')
    expect(fs.existsSync(statePath)).toBe(true)
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.paneId).toBe('%5')
    expect(state.state).toBe('working')
    expect(state.timestamp).toBeDefined()

    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('extracts question details when question state detected', async () => {
    mockListPanes.mockReturnValue([{ id: '%5', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue(
      'Which database should we use?\n❯ 1. PostgreSQL\n  2. SQLite\n  3. MongoDB\nEnter to select · Tab/Arrow keys to navigate'
    )

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})

    await runWatch({ cwd: tmpDir, once: true, notify: 'log' })

    const statePath = path.join(tmpDir, '.team-config', 'runner-state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.state).toBe('question')
    expect(state.detectedQuestion).toBeDefined()

    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('appends to runner-events.log on state transition', async () => {
    mockListPanes.mockReturnValue([{ id: '%5', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('Error: connection refused\nfailed to start\n$')

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const clearSpy = vi.spyOn(console, 'clear').mockImplementation(() => {})

    await runWatch({ cwd: tmpDir, once: true, notify: 'log' })

    const eventsPath = path.join(tmpDir, '.team-config', 'runner-events.log')
    expect(fs.existsSync(eventsPath)).toBe(true)
    const content = fs.readFileSync(eventsPath, 'utf-8')
    expect(content).toContain('error')

    clearSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})
