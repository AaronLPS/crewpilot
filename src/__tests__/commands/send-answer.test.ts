import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../scaffold.js', () => ({
  teamConfigExists: vi.fn().mockReturnValue(true),
}))

vi.mock('../../tmux.js', () => ({
  sendOption: vi.fn(),
  sendTextInput: vi.fn(),
  sleepMs: vi.fn(),
}))

import { sendOption, sendTextInput } from '../../tmux.js'
import { runSendAnswer } from '../../commands/send-answer.js'

const mockSendOption = vi.mocked(sendOption)
const mockSendTextInput = vi.mocked(sendTextInput)

describe('runSendAnswer', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-answer-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '%5\n', 'utf-8')
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('sends option number via sendOption', () => {
    runSendAnswer({ cwd: tmpDir, option: 2 })
    expect(mockSendOption).toHaveBeenCalledWith('%5', 2)
  })

  it('sends text via sendTextInput', () => {
    runSendAnswer({ cwd: tmpDir, text: 'PostgreSQL' })
    expect(mockSendTextInput).toHaveBeenCalledWith('%5', 'PostgreSQL')
  })

  it('throws if neither option nor text provided', () => {
    expect(() => runSendAnswer({ cwd: tmpDir })).toThrow(/--option or --text/)
  })

  it('throws if no runner pane ID found', () => {
    fs.writeFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), '', 'utf-8')
    expect(() => runSendAnswer({ cwd: tmpDir, option: 1 })).toThrow(/no active runner/)
  })

  it('throws if both option and text provided', () => {
    expect(() => runSendAnswer({ cwd: tmpDir, option: 1, text: 'hello' })).toThrow(/only one/)
  })
})
