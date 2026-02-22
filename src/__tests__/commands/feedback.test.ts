import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runFeedback } from '../../commands/feedback.js'

describe('runFeedback', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-feedback-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(path.join(configDir, 'human-inbox.md'), '# Human Inbox\n\n', 'utf-8')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('appends timestamped message to human-inbox.md', () => {
    runFeedback('Please add dark mode', tmpDir)

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'human-inbox.md'),
      'utf-8'
    )
    expect(content).toContain('Please add dark mode')
    expect(content).toMatch(/## \[\d{4}-\d{2}-\d{2}/)
  })

  it('appends multiple messages', () => {
    runFeedback('First message', tmpDir)
    runFeedback('Second message', tmpDir)

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'human-inbox.md'),
      'utf-8'
    )
    expect(content).toContain('First message')
    expect(content).toContain('Second message')
  })

  it('errors if .team-config does not exist', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-empty-'))
    expect(() => runFeedback('test', emptyDir)).toThrow(/crewpilot init/)
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })
})
