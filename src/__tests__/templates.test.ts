import { describe, it, expect } from 'vitest'
import {
  teamLeadPersonaTemplate,
  targetUserProfileTemplate,
  userContextTemplate,
  projectContextTemplate,
  sessionRecoveryTemplate,
  communicationLogTemplate,
  humanInboxTemplate,
  claudeMdAppend,
} from '../templates.js'

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
    expect(result).toContain('tmux list-panes')
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

  it('contains Superpowers phase detection patterns', () => {
    const result = teamLeadPersonaTemplate()
    expect(result).toContain('Superpowers phase markers')
    expect(result).toContain('brainstorming skill')
    expect(result).toContain('writing-plans skill')
    expect(result).toContain('Subagent-Driven Development')
  })

  it('contains Superpowers Runner Operations section', () => {
    const result = teamLeadPersonaTemplate()
    expect(result).toContain('Superpowers Runner Operations')
    expect(result).toContain('/superpowers:brainstorming')
    expect(result).toContain('spec compliance')
    expect(result).toContain('code quality')
  })

  it('contains Superpowers output file references', () => {
    const result = teamLeadPersonaTemplate()
    expect(result).toContain('docs/plans/')
    expect(result).toContain('-design.md')
    expect(result).toContain('-implementation.md')
  })

  it('contains GSD vs Superpowers comparison', () => {
    const result = teamLeadPersonaTemplate()
    expect(result).toContain('GSD vs Superpowers')
    expect(result).toContain('Choose GSD')
    expect(result).toContain('Choose Superpowers')
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

  it('includes singleton check section', () => {
    const persona = teamLeadPersonaTemplate()
    expect(persona).toContain('Singleton Check')
    expect(persona).toContain('.team-lead-lock')
  })

  it('includes CLI commands instead of raw tmux', () => {
    const persona = teamLeadPersonaTemplate()
    expect(persona).toContain('crewpilot launch-runner')
    expect(persona).toContain('crewpilot stop-runner')
    expect(persona).toContain('crewpilot send-answer')
  })

  it('includes context exhaustion protocol', () => {
    const persona = teamLeadPersonaTemplate()
    expect(persona).toContain('Context Exhaustion Protocol')
  })

  it('includes post-execution verification', () => {
    const persona = teamLeadPersonaTemplate()
    expect(persona).toContain('Post-Execution Verification')
  })

  it('includes runner-state.json reference', () => {
    const persona = teamLeadPersonaTemplate()
    expect(persona).toContain('runner-state.json')
  })

  it('includes communication log format with instance ID', () => {
    const persona = teamLeadPersonaTemplate()
    expect(persona).toContain('[TL-')
  })
})

describe('targetUserProfileTemplate', () => {
  it('includes user description in output', () => {
    const result = targetUserProfileTemplate({ description: 'College students aged 18-22' })
    expect(result).toContain('College students aged 18-22')
    expect(result).toContain('# Target User Profile')
    expect(result).toContain('version: 1')
  })
})

describe('userContextTemplate', () => {
  it('includes project info', () => {
    const result = userContextTemplate({
      projectName: 'TaskFlow',
      description: 'A project management tool',
      techStack: 'React + Node.js',
      workflow: 'gsd',
    })
    expect(result).toContain('TaskFlow')
    expect(result).toContain('A project management tool')
    expect(result).toContain('React + Node.js')
    expect(result).toContain('gsd')
  })
})

describe('projectContextTemplate', () => {
  it('returns empty template', () => {
    const result = projectContextTemplate()
    expect(result).toContain('# Project Context')
    expect(result).toContain('TODO')
  })
})

describe('sessionRecoveryTemplate', () => {
  it('contains recovery steps', () => {
    const result = sessionRecoveryTemplate()
    expect(result).toContain('Recovery')
    expect(result).toContain('target-user-profile.md')
    expect(result).toContain('state-snapshot.md')
  })
})

describe('communicationLogTemplate', () => {
  it('contains header and format example', () => {
    const result = communicationLogTemplate()
    expect(result).toContain('# Communication Log')
  })
})

describe('humanInboxTemplate', () => {
  it('contains usage instructions', () => {
    const result = humanInboxTemplate()
    expect(result).toContain('# Human Inbox')
    expect(result).toContain('crewpilot feedback')
  })
})

describe('claudeMdAppend', () => {
  it('contains Team Lead directives', () => {
    const result = claudeMdAppend()
    expect(result).toContain('Team Lead')
    expect(result).toContain('team-lead-persona.md')
  })
})
