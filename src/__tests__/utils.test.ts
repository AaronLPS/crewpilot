import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getProjectName, getTeamConfigDir, formatTimestamp, sanitizeSessionName, getSessionName, getDefaultBranch, writeLockfile, readLockfile, removeLockfile } from '../utils.js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))
const mockExecFileSync = vi.mocked(execFileSync)

describe('getProjectName', () => {
  it('reads project name from USER-CONTEXT.md content', () => {
    const content = '# User Context\n\n## Project Name\nMy Cool App\n\n## Description\nA thing'
    expect(getProjectName(content)).toBe('My Cool App')
  })

  it('returns null when no project name section found', () => {
    expect(getProjectName('# Something else')).toBeNull()
  })
})

describe('getTeamConfigDir', () => {
  it('returns .team-config path relative to given directory', () => {
    expect(getTeamConfigDir('/home/user/project')).toBe('/home/user/project/.team-config')
  })
})

describe('formatTimestamp', () => {
  it('formats date as YYYY-MM-DD HH:MM:SS', () => {
    const date = new Date('2026-02-22T14:30:00Z')
    const result = formatTimestamp(date)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
})

describe('sanitizeSessionName', () => {
  it('lowercases and replaces non-alphanumeric chars', () => {
    expect(sanitizeSessionName('My Cool App')).toBe('my-cool-app')
  })

  it('collapses multiple hyphens', () => {
    expect(sanitizeSessionName('foo--bar')).toBe('foo-bar')
  })

  it('strips leading/trailing hyphens', () => {
    expect(sanitizeSessionName('-foo-')).toBe('foo')
  })

  it('returns fallback for pure-unicode or empty names', () => {
    expect(sanitizeSessionName('日本語')).toBe('project')
    expect(sanitizeSessionName('!!!')).toBe('project')
    expect(sanitizeSessionName('')).toBe('project')
  })
})

describe('getSessionName', () => {
  it('prefixes with crewpilot-', () => {
    expect(getSessionName('MyApp')).toBe('crewpilot-myapp')
  })
})

describe('getDefaultBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns current branch from git symbolic-ref', () => {
    mockExecFileSync.mockReturnValueOnce(Buffer.from('main\n'))
    expect(getDefaultBranch('/tmp/test')).toBe('main')
  })

  it('returns master as fallback if git fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not a git repo')
    })
    expect(getDefaultBranch('/tmp/test')).toBe('master')
  })

  it('trims whitespace from branch name', () => {
    mockExecFileSync.mockReturnValueOnce(Buffer.from('  develop  \n'))
    expect(getDefaultBranch('/tmp/test')).toBe('develop')
  })
})

describe('lockfile management', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-lock-test-'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('writeLockfile', () => {
    it('writes a lockfile with pane ID and timestamp', () => {
      writeLockfile(tmpDir, '.team-lead-lock', '%0')
      const lockPath = path.join(tmpDir, '.team-config', '.team-lead-lock')
      const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))
      expect(content.paneId).toBe('%0')
      expect(content.pid).toBe(process.pid)
      expect(content.startedAt).toBeDefined()
    })
  })

  describe('readLockfile', () => {
    it('returns null if lockfile does not exist', () => {
      expect(readLockfile(tmpDir, '.team-lead-lock')).toBeNull()
    })

    it('returns parsed lockfile data', () => {
      const configDir = path.join(tmpDir, '.team-config')
      fs.mkdirSync(configDir, { recursive: true })
      const lockData = { paneId: '%0', pid: 123, startedAt: new Date().toISOString() }
      fs.writeFileSync(path.join(configDir, '.team-lead-lock'), JSON.stringify(lockData))
      const result = readLockfile(tmpDir, '.team-lead-lock')
      expect(result?.paneId).toBe('%0')
    })

    it('returns null for stale lockfiles (>24h)', () => {
      const configDir = path.join(tmpDir, '.team-config')
      fs.mkdirSync(configDir, { recursive: true })
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      const lockData = { paneId: '%0', pid: 123, startedAt: staleDate }
      fs.writeFileSync(path.join(configDir, '.team-lead-lock'), JSON.stringify(lockData))
      expect(readLockfile(tmpDir, '.team-lead-lock')).toBeNull()
    })
  })

  describe('removeLockfile', () => {
    it('removes the lockfile', () => {
      const configDir = path.join(tmpDir, '.team-config')
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(path.join(configDir, '.team-lead-lock'), '{}')
      removeLockfile(tmpDir, '.team-lead-lock')
      expect(fs.existsSync(path.join(configDir, '.team-lead-lock'))).toBe(false)
    })

    it('does not throw if lockfile does not exist', () => {
      expect(() => removeLockfile(tmpDir, '.team-lead-lock')).not.toThrow()
    })
  })
})
