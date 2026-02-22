import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  listPanes: vi.fn(),
}))

import { sessionExists, listPanes } from '../../tmux.js'
import { getStatusInfo } from '../../commands/status.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockListPanes = vi.mocked(listPanes)

describe('getStatusInfo', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-status-test-'))
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

  it('returns status with session info when session is active', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
      { id: '%1', active: false, command: 'claude' },
    ])
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'state-snapshot.md'),
      'Phase: GSD Execute Phase 3\nRunner: Active',
      'utf-8'
    )

    const info = getStatusInfo(tmpDir)
    expect(info.sessionActive).toBe(true)
    expect(info.paneCount).toBe(2)
    expect(info.stateSnapshot).toContain('Phase 3')
  })

  it('returns status without session when inactive', () => {
    mockSessionExists.mockReturnValue(false)
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'state-snapshot.md'),
      '',
      'utf-8'
    )

    const info = getStatusInfo(tmpDir)
    expect(info.sessionActive).toBe(false)
    expect(info.paneCount).toBe(0)
  })

  it('reads needs-human-decision.md', () => {
    mockSessionExists.mockReturnValue(false)
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'state-snapshot.md'),
      '',
      'utf-8'
    )
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'needs-human-decision.md'),
      'Should we use PostgreSQL or SQLite?',
      'utf-8'
    )

    const info = getStatusInfo(tmpDir)
    expect(info.pendingDecisions).toContain('PostgreSQL')
  })
})
