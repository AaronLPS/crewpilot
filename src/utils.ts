import path from 'node:path'
import { execFileSync } from 'node:child_process'

export function getProjectName(userContextContent: string): string | null {
  const match = userContextContent.match(/^## Project Name\n(.+)$/m)
  return match ? match[1].trim() : null
}

export function getTeamConfigDir(projectDir: string): string {
  return path.join(projectDir, '.team-config')
}

export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const MAX_SESSION_NAME_LENGTH = 64

export function sanitizeSessionName(name: string): string {
  const sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, MAX_SESSION_NAME_LENGTH).replace(/-$/, '')
  return sanitized || 'project'
}

export function getSessionName(projectName: string): string {
  return `crewpilot-${sanitizeSessionName(projectName)}`
}

export function getDefaultBranch(cwd: string): string {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd,
      stdio: 'pipe',
    }).toString().trim()
  } catch {
    return 'master'
  }
}
