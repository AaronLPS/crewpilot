import { describe, it, expect } from 'vitest'
import { teamLeadPersonaTemplate } from '../templates.js'

describe('teamLeadPersonaTemplate', () => {
  it('returns a non-empty string', () => {
    const result = teamLeadPersonaTemplate()
    expect(result.length).toBeGreaterThan(1000)
  })

  it('contains the three roles', () => {
    const result = teamLeadPersonaTemplate()
    expect(result).toContain('User Proxy')
    expect(result).toContain('tmux Manager')
    expect(result).toContain('Review & Evaluate')
  })

  it('contains tmux command references', () => {
    const result = teamLeadPersonaTemplate()
    expect(result).toContain('capture-pane')
    expect(result).toContain('send-keys')
    expect(result).toContain('split-window')
  })

  it('contains polling loop instructions', () => {
    const result = teamLeadPersonaTemplate()
    expect(result).toContain('Polling Loop')
    expect(result).toContain('5-8 seconds')
  })

  it('contains AskUserQuestion detection patterns', () => {
    const result = teamLeadPersonaTemplate()
    expect(result).toContain('AskUserQuestion')
    expect(result).toContain('Tab/Arrow keys')
  })

  it('contains context management instructions', () => {
    const result = teamLeadPersonaTemplate()
    expect(result).toContain('/clear')
    expect(result).toContain('state-snapshot.md')
  })

  it('contains file references', () => {
    const result = teamLeadPersonaTemplate()
    expect(result).toContain('target-user-profile.md')
    expect(result).toContain('USER-CONTEXT.md')
    expect(result).toContain('communication-log.md')
    expect(result).toContain('human-inbox.md')
    expect(result).toContain('session-recovery.md')
  })
})
