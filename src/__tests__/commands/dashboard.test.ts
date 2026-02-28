import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Mock dependencies using importOriginal pattern
vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  listPanes: vi.fn(),
  capturePaneContent: vi.fn(),
}))

// Mock express
vi.mock('express', () => ({
  default: vi.fn(() => ({
    get: vi.fn().mockReturnThis(),
  })),
}))

// Mock http with proper default export handling
vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual as object,
    createServer: vi.fn(() => ({
      listen: vi.fn(function(this: any, port: any, cb: any) {
        if (typeof cb === 'function') cb()
        return this
      }),
      close: vi.fn(function(this: any, cb: any) {
        if (typeof cb === 'function') cb()
      }),
    })),
  }
})

// Import after mocks are set up
import { sessionExists } from '../../tmux.js'
import { runDashboard } from '../../commands/dashboard.js'

const mockSessionExists = vi.mocked(sessionExists)

describe('runDashboard', () => {
  let tmpDir: string
  let processOnSpy: any

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-dashboard-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    
    // Mock process.on to prevent the server from staying open
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process)
    
    vi.clearAllMocks()
  })

  afterEach(() => {
    processOnSpy.mockRestore()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('throws error if no .team-config found', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-empty-'))

    // Should exit with error
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })

    await expect(runDashboard({ cwd: emptyDir })).rejects.toThrow('process.exit')

    mockExit.mockRestore()
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })

  it('starts dashboard server successfully', async () => {
    mockSessionExists.mockReturnValue(false)

    // Should not throw when starting server
    await expect(runDashboard({ cwd: tmpDir })).resolves.not.toThrow()
  })

  it('accepts custom port option', async () => {
    mockSessionExists.mockReturnValue(false)

    // Should not throw with custom port
    await expect(runDashboard({ cwd: tmpDir, port: 8080 })).resolves.not.toThrow()
  })

  it('accepts custom refresh rate option', async () => {
    mockSessionExists.mockReturnValue(false)

    // Should not throw with custom refresh rate
    await expect(runDashboard({ cwd: tmpDir, refreshRate: 10 })).resolves.not.toThrow()
  })

  it('reads state snapshot file if present', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'state-snapshot.md'),
      'Phase: Testing\nStatus: Active',
      'utf-8'
    )

    mockSessionExists.mockReturnValue(false)

    // Should not throw when snapshot exists
    await expect(runDashboard({ cwd: tmpDir })).resolves.not.toThrow()
  })

  it('reads pending decisions file if present', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'needs-human-decision.md'),
      'Which database should we use?',
      'utf-8'
    )

    mockSessionExists.mockReturnValue(false)

    // Should not throw when pending decisions exist
    await expect(runDashboard({ cwd: tmpDir })).resolves.not.toThrow()
  })
})
