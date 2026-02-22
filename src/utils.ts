import path from 'node:path'

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

export function sanitizeSessionName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function getSessionName(projectName: string): string {
  return `crewpilot-${sanitizeSessionName(projectName)}`
}
