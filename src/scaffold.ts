import fs from 'node:fs'
import path from 'node:path'
import {
  teamLeadPersonaTemplate,
  targetUserProfileTemplate,
  userContextTemplate,
  projectContextTemplate,
  sessionRecoveryTemplate,
  communicationLogTemplate,
  humanInboxTemplate,
} from './templates.js'

export interface ScaffoldInput {
  projectName: string
  description: string
  userDescription: string
  techStack: string
  workflow: string
}

export function scaffoldTeamConfig(projectDir: string, input: ScaffoldInput): void {
  const configDir = path.join(projectDir, '.team-config')

  try {
    fs.mkdirSync(configDir, { recursive: true })
    fs.mkdirSync(path.join(configDir, 'user-research'), { recursive: true })
    fs.mkdirSync(path.join(configDir, 'evaluations'), { recursive: true })
    fs.mkdirSync(path.join(configDir, 'archives'), { recursive: true })

    const files: Record<string, string> = {
      'team-lead-persona.md': teamLeadPersonaTemplate(),
      'target-user-profile.md': targetUserProfileTemplate({ description: input.userDescription }),
      'USER-CONTEXT.md': userContextTemplate({
        projectName: input.projectName,
        description: input.description,
        techStack: input.techStack,
        workflow: input.workflow,
      }),
      'project-context.md': projectContextTemplate(),
      'session-recovery.md': sessionRecoveryTemplate(),
      'state-snapshot.md': '',
      'communication-log.md': communicationLogTemplate(),
      'human-inbox.md': humanInboxTemplate(),
      'human-directives.md': '',
      'needs-human-decision.md': '',
      'runner-pane-id.txt': '',
    }

    for (const [filename, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(configDir, filename), content, 'utf-8')
    }
  } catch {
    throw new Error('Failed to create .team-config/. Check directory permissions.')
  }
}

export function teamConfigExists(projectDir: string): boolean {
  return fs.existsSync(path.join(projectDir, '.team-config'))
}

export function appendClaudeMd(projectDir: string, content: string): void {
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md')
  try {
    if (fs.existsSync(claudeMdPath)) {
      fs.appendFileSync(claudeMdPath, content, 'utf-8')
    } else {
      fs.writeFileSync(claudeMdPath, content, 'utf-8')
    }
  } catch {
    throw new Error('Failed to write CLAUDE.md. Check directory permissions.')
  }
}
