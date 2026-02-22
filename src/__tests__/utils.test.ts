import { describe, it, expect } from 'vitest'
import { getProjectName, getTeamConfigDir, formatTimestamp, sanitizeSessionName, getSessionName } from '../utils.js'

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
})

describe('getSessionName', () => {
  it('prefixes with crewpilot-', () => {
    expect(getSessionName('MyApp')).toBe('crewpilot-myapp')
  })
})
