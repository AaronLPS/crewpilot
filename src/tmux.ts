import { execFileSync, spawnSync } from 'node:child_process'

export interface PaneInfo {
  id: string
  active: boolean
  command: string
}

const STDIO_PIPE = { stdio: 'pipe' as const }

function tmux(...args: string[]): string {
  return execFileSync('tmux', args, STDIO_PIPE).toString()
}

export function sessionExists(name: string): boolean {
  try {
    tmux('has-session', '-t', name)
    return true
  } catch {
    return false
  }
}

export function createSession(name: string, cwd: string): void {
  tmux('new-session', '-d', '-s', name, '-c', cwd)
}

export function killSession(name: string): void {
  tmux('kill-session', '-t', name)
}

export function listPanes(session: string): PaneInfo[] {
  try {
    const output = tmux(
      'list-panes', '-t', session,
      '-F', '#{pane_id}\t#{pane_active}\t#{pane_current_command}'
    )
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [id, active, command] = line.split('\t')
      return { id, active: active === '1', command }
    })
  } catch {
    return []
  }
}

export function sendKeys(paneId: string, keys: string): void {
  tmux('send-keys', '-t', paneId, keys)
}

export function sendEnter(paneId: string): void {
  tmux('send-keys', '-t', paneId, 'Enter')
}

export function capturePaneContent(paneId: string, lines = 50): string {
  return tmux('capture-pane', '-t', paneId, '-p', '-S', `-${lines}`)
}

export function splitWindowHorizontal(session: string): string {
  tmux('split-window', '-h', '-t', session)
  return tmux('display-message', '-p', '-t', `${session}:{last}`, '#{pane_id}').trim()
}

export function sendTextInput(paneId: string, text: string): void {
  tmux('send-keys', '-t', paneId, text, 'Enter')
  sleepMs(1000)
  tmux('send-keys', '-t', paneId, 'Enter')
}

export function attachSession(name: string): void {
  spawnSync('tmux', ['attach-session', '-t', name], { stdio: 'inherit' })
}

export function sleepMs(ms: number): void {
  const start = Date.now()
  while (Date.now() - start < ms) {
    // Busy wait for cross-platform compatibility
    // This avoids spawning a process and works on all platforms
  }
}
