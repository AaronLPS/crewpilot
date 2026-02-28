import path from 'node:path'
import fs from 'node:fs'
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

// --- Lockfile management ---

export interface LockfileData {
  paneId: string
  pid: number
  startedAt: string
}

const LOCKFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export function writeLockfile(projectDir: string, filename: string, paneId: string): void {
  const configDir = path.join(projectDir, '.team-config')
  fs.mkdirSync(configDir, { recursive: true })
  const data: LockfileData = {
    paneId,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(configDir, filename), JSON.stringify(data, null, 2), 'utf-8')
}

export function readLockfile(projectDir: string, filename: string): LockfileData | null {
  const lockPath = path.join(projectDir, '.team-config', filename)
  try {
    const content = fs.readFileSync(lockPath, 'utf-8')
    const data: LockfileData = JSON.parse(content)
    // Check staleness
    const age = Date.now() - new Date(data.startedAt).getTime()
    if (age > LOCKFILE_MAX_AGE_MS) return null
    return data
  } catch {
    return null
  }
}

export function removeLockfile(projectDir: string, filename: string): void {
  const lockPath = path.join(projectDir, '.team-config', filename)
  try {
    fs.unlinkSync(lockPath)
  } catch {
    // File doesn't exist, that's fine
  }
}
