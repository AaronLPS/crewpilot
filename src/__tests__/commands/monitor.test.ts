import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Mock dependencies
vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  listPanes: vi.fn(),
  capturePaneContent: vi.fn(),
  sleepMs: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { sessionExists, listPanes, capturePaneContent, sleepMs } from '../../tmux.js'
import { runMonitor } from '../../commands/monitor.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockListPanes = vi.mocked(listPanes)
const mockCapturePaneContent = vi.mocked(capturePaneContent)
const mockSleepMs = vi.mocked(sleepMs)

describe('runMonitor', () => {
  let tmpDir: string
  let sleepCount: number

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-monitor-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    sleepCount = 0
    mockSleepMs.mockImplementation(() => {
      sleepCount++
      if (sleepCount > 2) {
        // Simulate Ctrl+C after a few iterations
        throw new Error('EXIT_LOOP')
      }
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('throws error if no .team-config found', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-empty-'))

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    await expect(runMonitor({ cwd: emptyDir })).rejects.toThrow('process.exit')

    mockExit.mockRestore()
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })

  it('creates heartbeat.log file', async () => {
    mockSessionExists.mockReturnValue(false)

    try {
      await runMonitor({ cwd: tmpDir, interval: 1 })
    } catch (e) {
      // Expected to exit loop
    }

    const logPath = path.join(tmpDir, '.team-config', 'heartbeat.log')
    expect(fs.existsSync(logPath)).toBe(true)
  })

  it('logs session activity to heartbeat log', async () => {
    mockSessionExists.mockReturnValue(false)

    try {
      await runMonitor({ cwd: tmpDir, interval: 1 })
    } catch (e) {
      // Expected
    }

    const logPath = path.join(tmpDir, '.team-config', 'heartbeat.log')
    const logContent = fs.readFileSync(logPath, 'utf-8')
    expect(logContent).toContain('# Crewpilot Heartbeat Log')
  })

  it('monitors active panes', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
    ])
    mockCapturePaneContent.mockReturnValue('Working on task... ⠋')

    try {
      await runMonitor({ cwd: tmpDir, interval: 1 })
    } catch (e) {
      // Expected
    }

    const logPath = path.join(tmpDir, '.team-config', 'heartbeat.log')
    const logContent = fs.readFileSync(logPath, 'utf-8')

    // Should have logged pane states
    const lines = logContent.split('\n').filter(l => l.trim())
    expect(lines.length).toBeGreaterThan(0)
  })

  it('detects working state from spinner indicators', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
    ])
    mockCapturePaneContent.mockReturnValue('Processing files... ⠋')

    try {
      await runMonitor({ cwd: tmpDir, interval: 1 })
    } catch (e) {
      // Expected
    }

    // Should have logged without alert (normal working state)
    const logPath = path.join(tmpDir, '.team-config', 'heartbeat.log')
    const logContent = fs.readFileSync(logPath, 'utf-8')
    expect(logContent).toContain('started')
  })

  it('accepts custom interval option', async () => {
    mockSessionExists.mockReturnValue(false)

    try {
      await runMonitor({ cwd: tmpDir, interval: 60 })
    } catch (e) {
      // Expected
    }

    // Monitor should have run with the custom interval
    expect(mockSleepMs).toHaveBeenCalledWith(60000)
  })

  it('accepts notification method option', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
    ])
    mockCapturePaneContent.mockReturnValue('Running...')

    try {
      await runMonitor({ cwd: tmpDir, interval: 1, notify: 'log' })
    } catch (e) {
      // Expected
    }

    // Should not throw and should create log file
    const logPath = path.join(tmpDir, '.team-config', 'heartbeat.log')
    expect(fs.existsSync(logPath)).toBe(true)
  })
})

describe('monitor stuck detection', () => {
  let tmpDir: string
  let callCount: number

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-stuck-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nStuckTest\n',
      'utf-8'
    )
    callCount = 0
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('tracks content changes over time', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
    ])

    // Same content every time (simulating stuck runner)
    mockCapturePaneContent.mockReturnValue('Working... ⠋ Processing')

    let iterations = 0
    mockSleepMs.mockImplementation(() => {
      iterations++
      if (iterations >= 5) throw new Error('EXIT_LOOP')
    })

    try {
      await runMonitor({ cwd: tmpDir, interval: 1 })
    } catch (e) {
      // Expected
    }

    // Should have captured pane content multiple times
    expect(mockCapturePaneContent).toHaveBeenCalled()
    expect(mockCapturePaneContent.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('detects stopped runners', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: false, command: 'bash' },
    ])
    mockCapturePaneContent.mockReturnValue('user@host:~$ ')

    let iterations = 0
    mockSleepMs.mockImplementation(() => {
      iterations++
      if (iterations > 2) throw new Error('EXIT_LOOP')
    })

    try {
      await runMonitor({ cwd: tmpDir, interval: 1 })
    } catch (e) {
      // Expected
    }

    const logPath = path.join(tmpDir, '.team-config', 'heartbeat.log')
    expect(fs.existsSync(logPath)).toBe(true)
  })
})
