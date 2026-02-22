import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { checkPrereqs } from '../prereqs.js'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

const mockExecFileSync = vi.mocked(execFileSync)

describe('checkPrereqs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when no requirements specified', () => {
    checkPrereqs([])
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it('passes when tmux is found', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('/usr/bin/tmux'))
    expect(() => checkPrereqs(['tmux'])).not.toThrow()
  })

  it('throws when tmux is not found', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })
    expect(() => checkPrereqs(['tmux'])).toThrow(/tmux not found/)
  })

  it('throws when claude is not found', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })
    expect(() => checkPrereqs(['claude'])).toThrow(/claude not found/)
  })

  it('checks multiple prerequisites', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('/usr/bin/tmux'))
    expect(() => checkPrereqs(['tmux', 'claude'])).not.toThrow()
    expect(mockExecFileSync).toHaveBeenCalledTimes(2)
  })
})
