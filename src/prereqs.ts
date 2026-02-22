import { execFileSync } from 'node:child_process'

type Prereq = 'tmux' | 'claude'

const INSTALL_HINTS: Record<Prereq, string> = {
  tmux: 'Install tmux: sudo apt install tmux (Linux) or brew install tmux (macOS)',
  claude: 'Install Claude Code: npm install -g @anthropic-ai/claude-code',
}

export function checkPrereqs(requirements: Prereq[]): void {
  for (const req of requirements) {
    try {
      execFileSync('which', [req], { stdio: 'pipe' })
    } catch {
      throw new Error(`${req} not found. ${INSTALL_HINTS[req]}`)
    }
  }
}
