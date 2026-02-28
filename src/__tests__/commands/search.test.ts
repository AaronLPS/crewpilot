import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../scaffold.js', () => ({
  teamConfigExists: vi.fn().mockReturnValue(true),
}))

import { teamConfigExists } from '../../scaffold.js'
import { runSearch, buildIndex } from '../../commands/search.js'

const mockTeamConfigExists = vi.mocked(teamConfigExists)

describe('runSearch', () => {
  let tmpDir: string
  let configDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-search-test-'))
    configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    vi.clearAllMocks()
    mockTeamConfigExists.mockReturnValue(true)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns early if query is too short', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('a', { cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('at least 2 characters'))
    consoleSpy.mockRestore()
  })

  it('returns early for empty query', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('', { cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('empty'))
    consoleSpy.mockRestore()
  })

  it('returns early if no team-config exists', () => {
    mockTeamConfigExists.mockReturnValue(false)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('test query', { cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No .team-config/ found'))
    consoleSpy.mockRestore()
  })

  it('searches in target-user-profile.md', () => {
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '# Target User\n\nThe user prefers TypeScript and React.\nThey work at a startup.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('TypeScript', { cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'))
    consoleSpy.mockRestore()
  })

  it('searches in user-research directory', () => {
    const researchDir = path.join(configDir, 'user-research')
    fs.mkdirSync(researchDir, { recursive: true })
    fs.writeFileSync(
      path.join(researchDir, 'interview-1.md'),
      '# Interview Notes\n\nUser mentioned they love automation tools.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('automation', { cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'))
    consoleSpy.mockRestore()
  })

  it('searches in evaluations directory', () => {
    const evalDir = path.join(configDir, 'evaluations')
    fs.mkdirSync(evalDir, { recursive: true })
    fs.writeFileSync(
      path.join(evalDir, 'sprint-1.md'),
      '# Sprint Review\n\nThe authentication feature was completed successfully.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('authentication', { cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'))
    consoleSpy.mockRestore()
  })

  it('searches in communication-log.md', () => {
    fs.writeFileSync(
      path.join(configDir, 'communication-log.md'),
      '# Communication Log\n\n2024-01-15: Discussed API design patterns.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('API design', { cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'))
    consoleSpy.mockRestore()
  })

  it('sorts results by score', () => {
    fs.writeFileSync(
      path.join(configDir, 'communication-log.md'),
      '# Log\n\nReact is great.\nReact and TypeScript together are powerful.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('React TypeScript', { cwd: tmpDir, limit: 10 })
    
    // Should find and sort results
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'))
    consoleSpy.mockRestore()
  })

  it('shows no results message when nothing found', () => {
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '# Profile\n\nUser details here.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('xyznonexistent', { cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No results found'))
    consoleSpy.mockRestore()
  })

  it('limits results according to limit option', () => {
    // Create files in searchable locations (user-research directory)
    const researchDir = path.join(configDir, 'user-research')
    fs.mkdirSync(researchDir, { recursive: true })
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(
        path.join(researchDir, `file-${i}.md`),
        `# File ${i}\n\nThis contains the keyword searchable content.`,
        'utf-8'
      )
    }
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('searchable', { cwd: tmpDir, limit: 3 })
    
    // Should show limited results
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'))
    consoleSpy.mockRestore()
  })

  it('supports fuzzy matching', () => {
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '# Profile\n\nThe user likes TypeScript programming.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('TypeScipt', { cwd: tmpDir, fuzzy: true }) // Typo intentional
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'))
    consoleSpy.mockRestore()
  })

  it('supports case-sensitive search', () => {
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '# Profile\n\nThe user likes TypeScript.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    // Case-sensitive search for lowercase should not match TypeScript
    runSearch('typescript', { cwd: tmpDir, caseSensitive: true })
    
    // Should still find with case-insensitive default
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('case-sensitive search only matches exact case', () => {
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '# Profile\n\nWe use API for authentication.\nThe api module is simple.\nCall the Api class.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    // Case-sensitive search for "API" should only match uppercase
    runSearch('API', { cwd: tmpDir, caseSensitive: true })
    
    // Should find the file but only with 1 match (uppercase API)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'))
    consoleSpy.mockRestore()
  })

  it('case-insensitive search matches all cases by default', () => {
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '# Profile\n\nWe use API for authentication.\nThe api module is simple.\nCall the Api class.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    // Default case-insensitive search should match all variations
    runSearch('API', { cwd: tmpDir, caseSensitive: false })
    
    // Should find the file with multiple matches
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'))
    consoleSpy.mockRestore()
  })

  it('handles empty files gracefully', () => {
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('anything', { cwd: tmpDir })
    
    // Should not crash
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('handles binary files gracefully', () => {
    // Write a binary file with null bytes
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x48, 0x65, 0x6c, 0x6c, 0x6f])
    fs.writeFileSync(
      path.join(configDir, 'binary-file.md'),
      buffer
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('Hello', { cwd: tmpDir })
    
    // Should not crash
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('handles very long query gracefully', () => {
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '# Profile\n\nUser details here.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    const longQuery = 'a'.repeat(300)
    runSearch(longQuery, { cwd: tmpDir })
    
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('too long'))
    consoleSpy.mockRestore()
  })

  it('shows suggestions when few results', () => {
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '# Profile\n\nSome content.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('raretermxyz', { cwd: tmpDir })
    
    // Should show suggestions for fuzzy matching
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('fuzzy'))
    consoleSpy.mockRestore()
  })

  it('groups results by file', () => {
    fs.writeFileSync(
      path.join(configDir, 'communication-log.md'),
      '# Log\n\nReact is great.\nReact is awesome.\nReact is powerful.',
      'utf-8'
    )
    
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    
    runSearch('React', { cwd: tmpDir })
    
    // Should show file-level grouping
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Found'))
    consoleSpy.mockRestore()
  })
})

describe('buildIndex', () => {
  let tmpDir: string
  let configDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-index-test-'))
    configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates memory-index.json with entries', () => {
    fs.writeFileSync(
      path.join(configDir, 'target-user-profile.md'),
      '# Profile\n\nThe user likes React and TypeScript. React is great.',
      'utf-8'
    )
    
    buildIndex(tmpDir)
    
    const indexPath = path.join(configDir, 'memory-index.json')
    expect(fs.existsSync(indexPath)).toBe(true)
    
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    expect(index.lastUpdated).toBeDefined()
    expect(index.entries).toBeDefined()
    expect(index.entries.length).toBeGreaterThan(0)
  })

  it('indexes user-research directory', () => {
    const researchDir = path.join(configDir, 'user-research')
    fs.mkdirSync(researchDir, { recursive: true })
    fs.writeFileSync(
      path.join(researchDir, 'research.md'),
      '# Research\n\nFindings about user preferences.',
      'utf-8'
    )
    
    buildIndex(tmpDir)
    
    const indexPath = path.join(configDir, 'memory-index.json')
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    
    expect(index.entries.some((e: any) => e.file.includes('research'))).toBe(true)
  })

  it('indexes evaluations directory', () => {
    const evalDir = path.join(configDir, 'evaluations')
    fs.mkdirSync(evalDir, { recursive: true })
    fs.writeFileSync(
      path.join(evalDir, 'eval.md'),
      '# Evaluation\n\nPerformance metrics.',
      'utf-8'
    )
    
    buildIndex(tmpDir)
    
    const indexPath = path.join(configDir, 'memory-index.json')
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    
    expect(index.entries.some((e: any) => e.file.includes('eval'))).toBe(true)
  })

  it('handles empty files in index', () => {
    fs.writeFileSync(
      path.join(configDir, 'empty.md'),
      '',
      'utf-8'
    )
    
    buildIndex(tmpDir)
    
    const indexPath = path.join(configDir, 'memory-index.json')
    expect(fs.existsSync(indexPath)).toBe(true)
  })

  it('handles large files by skipping them', () => {
    // Create a large file (11MB)
    const largeContent = 'x'.repeat(11 * 1024 * 1024)
    fs.writeFileSync(
      path.join(configDir, 'large-file.md'),
      largeContent,
      'utf-8'
    )
    
    buildIndex(tmpDir)
    
    const indexPath = path.join(configDir, 'memory-index.json')
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    
    // Should not include the large file
    expect(index.entries.some((e: any) => e.file.includes('large-file'))).toBe(false)
  })
})
