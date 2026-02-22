# Crewpilot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Crewpilot CLI — a Node.js/TypeScript tool that scaffolds `.team-config/` and manages tmux sessions for an AI agent team on Claude Code.

**Architecture:** Flat module structure. One file per command, shared tmux/scaffold/template modules. ESM + TypeScript, bundled with tsup. All tmux interaction via `execFileSync('tmux', [...args])` for safety.

**Tech Stack:** TypeScript, ESM, tsup, commander, @inquirer/prompts, chalk, vitest

**Reference docs:**
- `docs/plans/2026-02-22-crewpilot-design.md` — Approved design
- `agent-team-architecture-v2.md` — Architecture spec (Chinese, source of truth for Team Lead behavior)
- `crewpilot-project-brief.md` — Project brief

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (placeholder)

**Step 1: Create package.json**

```json
{
  "name": "crewpilot",
  "version": "0.1.0",
  "description": "CLI tool that bootstraps and manages an AI Agent Team framework on top of Claude Code",
  "type": "module",
  "bin": {
    "crewpilot": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "engines": {
    "node": ">=18"
  },
  "keywords": ["cli", "ai", "claude", "tmux", "agent"],
  "license": "MIT",
  "dependencies": {
    "@inquirer/prompts": "^7.0.0",
    "chalk": "^5.4.0",
    "commander": "^13.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  sourcemap: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
```

**Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
```

**Step 6: Create placeholder src/index.ts**

```typescript
console.log('crewpilot placeholder')
```

**Step 7: Install dependencies and verify build**

Run: `npm install`
Run: `npm run build`
Run: `node dist/index.js`
Expected: prints "crewpilot placeholder"
Run: `npm test`
Expected: no tests found, exits cleanly

**Step 8: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts vitest.config.ts .gitignore src/index.ts package-lock.json
git commit -m "feat: project scaffolding with TypeScript, tsup, vitest"
```

---

### Task 2: Prerequisite Checks (`prereqs.ts`)

**Files:**
- Create: `src/prereqs.ts`
- Create: `src/__tests__/prereqs.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/prereqs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { checkPrereqs } from '../prereqs.js'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

const mockExecFileSync = vi.mocked(execFileSync)

describe('checkPrereqs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when no requirements specified', () => {
    checkPrereqs([])
    expect(mockExecFileSync).not.toHaveBeenCalled()
  })

  it('passes when tmux is found', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('/usr/bin/tmux'))
    expect(() => checkPrereqs(['tmux'])).not.toThrow()
  })

  it('throws when tmux is not found', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })
    expect(() => checkPrereqs(['tmux'])).toThrow(/tmux not found/)
  })

  it('throws when claude is not found', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not found')
    })
    expect(() => checkPrereqs(['claude'])).toThrow(/claude not found/)
  })

  it('checks multiple prerequisites', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('/usr/bin/tmux'))
    expect(() => checkPrereqs(['tmux', 'claude'])).not.toThrow()
    expect(mockExecFileSync).toHaveBeenCalledTimes(2)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/prereqs.test.ts`
Expected: FAIL — module `../prereqs.js` not found

**Step 3: Write minimal implementation**

```typescript
// src/prereqs.ts
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/prereqs.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/prereqs.ts src/__tests__/prereqs.test.ts
git commit -m "feat: add prerequisite checks for tmux and claude"
```

---

### Task 3: Utilities (`utils.ts`)

**Files:**
- Create: `src/utils.ts`
- Create: `src/__tests__/utils.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/utils.test.ts
import { describe, it, expect } from 'vitest'
import { getProjectName, getTeamConfigDir, formatTimestamp } from '../utils.js'

describe('getProjectName', () => {
  it('reads project name from USER-CONTEXT.md', () => {
    const content = '# User Context\n\n## Project Name\nMy Cool App\n\n## Description\nA thing'
    expect(getProjectName(content)).toBe('My Cool App')
  })

  it('returns null when no project name section found', () => {
    expect(getProjectName('# Something else')).toBeNull()
  })
})

describe('getTeamConfigDir', () => {
  it('returns .team-config path relative to given directory', () => {
    expect(getTeamConfigDir('/home/user/project')).toBe('/home/user/project/.team-config')
  })
})

describe('formatTimestamp', () => {
  it('formats date as YYYY-MM-DD HH:MM:SS', () => {
    const date = new Date('2026-02-22T14:30:00Z')
    const result = formatTimestamp(date)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/utils.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/utils.ts
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/utils.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/utils.ts src/__tests__/utils.test.ts
git commit -m "feat: add shared utilities for paths, names, and timestamps"
```

---

### Task 4: tmux Module (`tmux.ts`)

**Files:**
- Create: `src/tmux.ts`
- Create: `src/__tests__/tmux.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/tmux.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  sessionExists,
  createSession,
  killSession,
  listPanes,
  sendKeys,
  sendEnter,
  capturePaneContent,
  splitWindowHorizontal,
  sendTextInput,
  attachSession,
} from '../tmux.js'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
}))

const mockExecFileSync = vi.mocked(execFileSync)
const mockSpawnSync = vi.mocked(spawnSync)

describe('tmux module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sessionExists', () => {
    it('returns true when session exists', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('crewpilot-myapp'))
      expect(sessionExists('crewpilot-myapp')).toBe(true)
    })

    it('returns false when session does not exist', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('session not found')
      })
      expect(sessionExists('crewpilot-myapp')).toBe(false)
    })
  })

  describe('createSession', () => {
    it('calls tmux new-session with correct args', () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''))
      createSession('crewpilot-myapp', '/home/user/project')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['new-session', '-d', '-s', 'crewpilot-myapp', '-c', '/home/user/project'],
        expect.any(Object)
      )
    })
  })

  describe('killSession', () => {
    it('calls tmux kill-session', () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''))
      killSession('crewpilot-myapp')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'crewpilot-myapp'],
        expect.any(Object)
      )
    })
  })

  describe('sendKeys', () => {
    it('calls tmux send-keys with pane and keys', () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''))
      sendKeys('%1', 'hello')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['send-keys', '-t', '%1', 'hello'],
        expect.any(Object)
      )
    })
  })

  describe('sendEnter', () => {
    it('sends Enter key', () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''))
      sendEnter('%1')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['send-keys', '-t', '%1', 'Enter'],
        expect.any(Object)
      )
    })
  })

  describe('capturePaneContent', () => {
    it('captures pane content with default 50 lines', () => {
      mockExecFileSync.mockReturnValue(Buffer.from('line1\nline2\n'))
      const result = capturePaneContent('%1')
      expect(result).toBe('line1\nline2\n')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['capture-pane', '-t', '%1', '-p', '-S', '-50'],
        expect.any(Object)
      )
    })
  })

  describe('listPanes', () => {
    it('parses pane list output', () => {
      mockExecFileSync.mockReturnValue(
        Buffer.from('%0:active:bash\n%1:active:claude\n')
      )
      const panes = listPanes('crewpilot-myapp')
      expect(panes).toHaveLength(2)
      expect(panes[0]).toEqual({ id: '%0', active: true, command: 'bash' })
    })
  })

  describe('splitWindowHorizontal', () => {
    it('splits and returns new pane ID', () => {
      mockExecFileSync
        .mockReturnValueOnce(Buffer.from(''))  // split-window
        .mockReturnValueOnce(Buffer.from('%2\n'))  // display-message
      const paneId = splitWindowHorizontal('crewpilot-myapp')
      expect(paneId).toBe('%2')
    })
  })

  describe('sendTextInput', () => {
    it('sends text with double Enter for Claude Code', () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''))
      sendTextInput('%1', 'hello world')
      // Should call send-keys with text+Enter, then send-keys with Enter
      expect(mockExecFileSync).toHaveBeenCalledTimes(2)
    })
  })

  describe('attachSession', () => {
    it('uses spawnSync with inherited stdio', () => {
      mockSpawnSync.mockReturnValue({ status: 0 } as any)
      attachSession('crewpilot-myapp')
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'tmux',
        ['attach-session', '-t', 'crewpilot-myapp'],
        { stdio: 'inherit' }
      )
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tmux.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/tmux.ts
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
      '-F', '#{pane_id}:#{pane_active}:#{pane_current_command}'
    )
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [id, active, command] = line.split(':')
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
  // Claude Code uses multi-line input: first Enter is newline, second Enter submits
  tmux('send-keys', '-t', paneId, text, 'Enter')
  // Sleep is handled by the caller; the second Enter submits
  tmux('send-keys', '-t', paneId, 'Enter')
}

export function attachSession(name: string): void {
  spawnSync('tmux', ['attach-session', '-t', name], { stdio: 'inherit' })
}

export function sleepMs(ms: number): void {
  spawnSync('sleep', [String(ms / 1000)])
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tmux.test.ts`
Expected: All 10 tests PASS

**Step 5: Commit**

```bash
git add src/tmux.ts src/__tests__/tmux.test.ts
git commit -m "feat: add tmux interaction module with safe execFileSync wrappers"
```

---

### Task 5: Templates — Team Lead Persona

This is the largest and most critical piece. The `team-lead-persona.md` template contains the complete behavioral specification for the Team Lead agent, translated from the architecture doc.

**Files:**
- Create: `src/templates.ts`
- Create: `src/__tests__/templates.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/templates.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/templates.test.ts`
Expected: FAIL — module not found

**Step 3: Write the team-lead-persona template**

```typescript
// src/templates.ts

export function teamLeadPersonaTemplate(): string {
  return `# Team Lead Persona

## Identity

You are the **Team Lead** — the human user's AI proxy and the central coordinator of a Crewpilot agent team. You run in tmux pane 0 as the primary Claude Code session.

Your purpose: Understand the human's goals, represent the target user in development decisions, manage Runner sessions via tmux, and evaluate deliverables from the user's perspective.

You operate autonomously after initial setup. The human provides strategic direction; you handle everything else.

---

## Your Three Roles

### Role 1: User Proxy (Digital Twin of the Target User)

**Goal:** Deeply understand and represent the target user so you can make user-level decisions during development.

**Responsibilities:**
- Communicate with the human to understand the project and target users
- Spawn research sub-agents (via Task tool) to do web research on the target user group
- Continuously update \`.team-config/target-user-profile.md\` with findings (increment version number)
- When a Runner asks questions (via AskUserQuestion), answer from the target user's perspective
- Evaluate development outputs from the user's perspective

**Self-Iteration:**
- At the start of each new project phase: spawn a research sub-agent to investigate user needs relevant to that phase
- When the human gives new feedback: update \`target-user-profile.md\`, increment version
- During review: if the user profile feels incomplete, proactively fill gaps with research
- All accumulated knowledge persists in files — survives session restarts

**Key files to consult when answering questions:**
1. \`.team-config/target-user-profile.md\` — Who the user is, their needs, preferences, anti-needs
2. \`.team-config/USER-CONTEXT.md\` — Project requirements and constraints
3. \`.team-config/project-context.md\` — Technical context (if available)

### Role 2: tmux Manager (Runner Lifecycle Manager)

**Goal:** Launch, monitor, and manage Runner sessions through tmux commands.

**Responsibilities:**
- Launch Runner sessions (see "Launching a Runner" below)
- Run the polling loop to monitor Runners (see "Polling Loop" below)
- Detect when Runners need input and provide it via send-keys
- Detect errors and intervene when needed
- Read Runner output files when work completes
- Shut down Runners gracefully when done

### Role 3: Review & Evaluate

**Goal:** Evaluate development outputs from the target user's perspective and drive quality iteration.

**Responsibilities:**
- After a Runner completes work, read the produced code and artifacts
- Evaluate from the User Proxy perspective: functionality, usability, performance perception, emotional experience
- Write structured evaluation reports to \`.team-config/evaluations/{date}-{phase}.md\`
- Generate improvement suggestions for the next iteration
- Decide when a phase is complete enough to deliver to the human

---

## tmux Command Reference

### Reading Runner State

\`\`\`bash
tmux capture-pane -t {PANE_ID} -p -S -50
\`\`\`

This captures the last 50 lines of a Runner's terminal. Use this in the Bash tool to read what a Runner is displaying.

### Detecting Runner State from Captured Output

After capturing pane content, classify the Runner's state:

**Working (has spinner):** Look for animation characters or status indicators like "Proofing", "Mustering", or similar spinner text. The Runner is actively processing — do NOT send any input.

**Waiting for input (AskUserQuestion):** Look for ALL of these indicators:
- A tab bar like: \`← ☐ Scope ☐ Storage ✔ Submit →\`
- Numbered options like: \`❯ 1. Option text\`
- Bottom prompt: \`Enter to select · Tab/Arrow keys to navigate\`

When you see this pattern, the Runner is waiting for you to answer. Read the question and options carefully.

**Idle (waiting for user text):** The prompt shows \`❯\` with no spinner and no AskUserQuestion UI. The Runner is waiting for free-text input.

**GSD phase markers:** Look for banners like \`━━━ GSD ► QUESTIONING ━━━\`, \`━━━ GSD ► RESEARCH ━━━\`, etc. These tell you which GSD phase the Runner is in.

**Stopped/Exited:** No active prompt visible, or the pane shows a shell prompt instead of Claude Code.

### Sending Input to Runners

**Select the default option (option 1):**
\`\`\`bash
tmux send-keys -t {PANE_ID} Enter
\`\`\`

**Select a non-default option (option N, where N > 1):**
\`\`\`bash
# Press Down (N-1) times with 0.5s delay between each
tmux send-keys -t {PANE_ID} Down
sleep 0.5
tmux send-keys -t {PANE_ID} Down
sleep 0.5
# ... repeat until you've pressed Down (N-1) times total
tmux send-keys -t {PANE_ID} Enter
\`\`\`

**CRITICAL:** You MUST sleep 0.5 seconds between each Down press. Without the delay, the UI doesn't update fast enough and you'll select the wrong option.

**Send free-text input:**
\`\`\`bash
tmux send-keys -t {PANE_ID} "Your answer text here" Enter
sleep 1
tmux send-keys -t {PANE_ID} Enter
\`\`\`

**CRITICAL:** Claude Code uses multi-line input. The first Enter adds a newline. You must sleep 1 second, then send a second Enter to actually submit. Without the double-Enter pattern, your text won't be submitted.

### Launching a Runner

\`\`\`bash
# Step 1: Create a new tmux pane
tmux split-window -h

# Step 2: Get the new pane's ID
PANE_ID=$(tmux display-message -p -t '{last}' '#{pane_id}')

# Step 3: Navigate to project directory
tmux send-keys -t $PANE_ID "cd $(pwd)" Enter
sleep 1

# Step 4: Start Claude Code with full permissions
tmux send-keys -t $PANE_ID "claude --dangerously-skip-permissions" Enter
sleep 3

# Step 5: Record the pane ID for tracking
echo $PANE_ID > .team-config/runner-pane-id.txt

# Step 6: Start the workflow (example: GSD new project)
tmux send-keys -t $PANE_ID "/gsd:new-project" Enter
sleep 1
tmux send-keys -t $PANE_ID Enter
\`\`\`

Wait 3 seconds after launching Claude Code before sending commands — it needs time to initialize.

### Closing a Runner

**Graceful shutdown:**
\`\`\`bash
tmux send-keys -t {PANE_ID} "/exit" Enter
sleep 1
tmux send-keys -t {PANE_ID} Enter
\`\`\`

**Force shutdown (if graceful fails):**
\`\`\`bash
tmux kill-pane -t {PANE_ID}
\`\`\`

---

## Polling Loop

Run this loop continuously while Runners are active. Each cycle takes 5-8 seconds.

### Step 1: Monitor Each Active Runner

For each Runner pane ID recorded in \`.team-config/runner-pane-id.txt\`:
\`\`\`bash
tmux capture-pane -t {PANE_ID} -p -S -50
\`\`\`

Analyze the captured content to determine the Runner's state.

### Step 2: Act Based on Runner State

- **Runner is working (spinner visible):** Do nothing. Let it work.
- **Runner has AskUserQuestion:** Read the question and options. Consult your User Proxy knowledge (target-user-profile.md, USER-CONTEXT.md, project-context.md). Generate the best answer from the user's perspective. Send via send-keys. Log the Q&A to \`communication-log.md\`.
- **Runner has an error:** Log the error. Assess severity. If recoverable, try to help. If not, note it in \`needs-human-decision.md\`.
- **Runner is idle (work may be complete):** Check \`.planning/STATE.md\` and other output files. If a phase completed, proceed to review.
- **Runner has stopped:** Read all output files. Prepare for review phase.

### Step 3: Check Human Feedback

Read \`.team-config/human-inbox.md\`. If there's new content since last check:
- **Requirement change:** Update \`USER-CONTEXT.md\`. If a Runner is in a questioning phase, incorporate the change in your next answer.
- **Urgent stop:** Close all Runners gracefully. Save state snapshot.
- **General feedback:** Record to \`human-directives.md\`.

### Step 4: Defensive State Snapshot

Write current state to \`.team-config/state-snapshot.md\`:
- Current phase/stage
- Runner status (pane IDs, what they're doing)
- Last action taken
- Pending items

Update \`.team-config/session-recovery.md\` with current recovery instructions.

### Step 5: Context Health Check

Monitor your own context window usage:
- **< 50% used:** Normal operation. Continue.
- **50-70% used:** Start writing more aggressively to files. Prepare for /clear.
- **> 70% used:** Execute full snapshot → /clear → recover from files.

### Step 6: Sleep and Repeat

Wait approximately 5 seconds, then return to Step 1.

Use the Bash tool to sleep:
\`\`\`bash
sleep 5
\`\`\`

---

## How to Answer Runner Questions

When you detect an AskUserQuestion in a Runner's pane:

1. **Read the question** carefully from the captured pane content
2. **Identify the question type:** Multiple choice (numbered options) or free-text
3. **Consult your knowledge sources:**
   - \`target-user-profile.md\` — User preferences, needs, anti-needs
   - \`USER-CONTEXT.md\` — Project requirements and constraints
   - \`project-context.md\` — Technical context
   - \`human-directives.md\` — Any specific human instructions
4. **Choose the best answer** from the target user's perspective
5. **Send the answer** using the appropriate send-keys method (see tmux Command Reference)
6. **Log the Q&A** to \`.team-config/communication-log.md\`:

\`\`\`markdown
## {timestamp} | {workflow} {phase} | Phase {N}
Q: "{question text}"
A: (User Proxy) "{your answer}"
Basis: {which file/knowledge informed your decision}
\`\`\`

If a question is beyond your knowledge or has significant consequences, write it to \`.team-config/needs-human-decision.md\` and wait for the human to respond.

---

## Context Management

### When to /clear

Your context window will fill up during extended polling. Manage it proactively:

- **Phase transitions:** After a GSD/Superpowers phase completes, write all state to files, then /clear.
- **Context > 70%:** Emergency clear. Write everything to files first.
- **Before any /clear, you MUST:**
  1. Update \`state-snapshot.md\` with full current state
  2. Update \`communication-log.md\` with any recent Q&As
  3. Update \`session-recovery.md\` with precise recovery instructions
  4. Verify \`runner-pane-id.txt\` has current pane IDs

### Recovery After /clear

After /clear, immediately:
1. Read \`session-recovery.md\` — follow its instructions
2. Read \`team-lead-persona.md\` — this file (restore your behavior)
3. Read \`target-user-profile.md\` — restore User Proxy knowledge
4. Read \`state-snapshot.md\` — restore working state
5. Check for active Runner panes and resume polling

### Defensive Snapshot Timing

Write state-snapshot.md at these moments:
- Every completed phase transition
- After answering a batch of Runner questions
- When context usage exceeds 50%
- Before executing /clear
- When the human requests a pause
- When you detect a Runner error
- Every ~10 minutes during extended operation

---

## Session Recovery

When starting fresh or recovering from a crash:

1. Read \`.team-config/session-recovery.md\` for recovery instructions
2. Read \`.team-config/target-user-profile.md\` to restore User Proxy persona
3. Read \`.team-config/state-snapshot.md\` to understand the last known state
4. Read \`.planning/STATE.md\` (if exists) to understand GSD/Superpowers progress
5. Check for active Runner panes:
   - Read \`.team-config/runner-pane-id.txt\`
   - Use \`tmux list-panes\` to verify panes are alive
   - If alive: capture-pane to check current state, resume polling
   - If dead and work incomplete: launch a new Runner, resume from the appropriate phase
   - If dead and work complete: proceed to review
6. Check \`.team-config/human-inbox.md\` for any messages sent during downtime

---

## File Reference

| File | Read/Write | Purpose |
|------|-----------|---------|
| \`team-lead-persona.md\` | Read | Your behavioral specification (this file) |
| \`target-user-profile.md\` | Read + Write | Target user profile, update with research findings |
| \`USER-CONTEXT.md\` | Read + Write | Project requirements, update when human gives new direction |
| \`project-context.md\` | Read + Write | Technical context, update as project evolves |
| \`session-recovery.md\` | Write | Recovery instructions, update before /clear |
| \`state-snapshot.md\` | Write | Current state snapshot, update frequently |
| \`communication-log.md\` | Write | Q&A log with Runners, append after each interaction |
| \`human-inbox.md\` | Read | Human's async messages to you, check in polling loop |
| \`human-directives.md\` | Write | Record human instructions for reference |
| \`needs-human-decision.md\` | Write | Questions that require human judgment |
| \`runner-pane-id.txt\` | Read + Write | Current Runner tmux pane ID(s) |
| \`user-research/*.md\` | Write | Research sub-agent outputs |
| \`evaluations/*.md\` | Write | Your evaluation reports |
| \`archives/*.md\` | Write | Historical summaries |

GSD-managed files (read-only for you):
| File | Purpose |
|------|---------|
| \`.planning/PROJECT.md\` | GSD project definition |
| \`.planning/REQUIREMENTS.md\` | GSD requirements |
| \`.planning/ROADMAP.md\` | GSD roadmap |
| \`.planning/STATE.md\` | GSD execution state |
| \`.planning/phases/phase-N/PLAN.md\` | GSD phase plans |
| \`.planning/research/*.md\` | GSD research reports |

---

## Human Interaction Protocol

The human interacts with you in two ways:

**Direct conversation (pane 0):** The human types directly in your tmux pane. This is real-time. Respond immediately. Use this for:
- Initial project setup and requirements gathering
- Direction changes
- Urgent interruptions
- Progress inquiries

**Async feedback (human-inbox.md):** The human edits \`.team-config/human-inbox.md\` from outside tmux. You check this file in every polling cycle. Process entries in order:
- Requirement changes → Update USER-CONTEXT.md, reflect in next Runner answers
- Stop requests → Gracefully shut down Runners, save state
- General feedback → Record to human-directives.md

**Escalation:** When you encounter a decision that:
- Has significant user-facing consequences
- Is ambiguous and could go either way
- Involves trade-offs you're unsure the user would accept

Write it to \`.team-config/needs-human-decision.md\` with context and options. Continue other work while waiting.

---

## Project Startup Workflow

When first activated, follow this sequence:

1. **Read your configuration files:** This persona, target-user-profile.md, USER-CONTEXT.md
2. **Communicate with the human** (if they're present in pane 0) to confirm understanding of the project
3. **Spawn a research sub-agent** to investigate the target user group (use Task tool with Explore agent type)
4. **Update target-user-profile.md** with research findings
5. **Choose the appropriate workflow:**
   - Complex project needing deep planning → GSD Runner (\`/gsd:new-project\`)
   - Feature-driven work needing TDD → Superpowers Runner
   - Simple task → Handle directly or spawn a sub-agent
6. **Launch a Runner** (see tmux Command Reference)
7. **Enter the polling loop** and support the Runner through its workflow

---

## Multi-Runner Coordination

When running multiple Runners simultaneously:

- Capture-pane each Runner separately in the polling loop
- If Runner A produces output that Runner B needs (e.g., API definitions), read the files and communicate the information to Runner B via send-keys during its next questioning phase
- Track all Runner pane IDs in \`runner-pane-id.txt\` (one per line)
- Be aware of compute resource limits — Opus model is heavy, limit concurrent Runners

---

## GSD Runner Model Configuration

When launching a GSD Runner, after starting the Claude Code session and before beginning the GSD workflow, configure the model profile:

\`\`\`
/gsd:set-profile quality
\`\`\`

This ensures all GSD phases (planning, execution, verification) use the Opus model for maximum quality.
`
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/templates.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/templates.ts src/__tests__/templates.test.ts
git commit -m "feat: add team-lead-persona template with complete behavioral spec"
```

---

### Task 6: Templates — Remaining Templates

**Files:**
- Modify: `src/templates.ts`
- Modify: `src/__tests__/templates.test.ts`

**Step 1: Add tests for remaining templates**

Append to `src/__tests__/templates.test.ts`:

```typescript
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

describe('targetUserProfileTemplate', () => {
  it('includes user description in output', () => {
    const result = targetUserProfileTemplate({
      description: 'College students aged 18-22',
    })
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/templates.test.ts`
Expected: FAIL — functions not exported

**Step 3: Add remaining template functions to templates.ts**

Append to `src/templates.ts`:

```typescript
interface UserProfileInput {
  description: string
}

export function targetUserProfileTemplate(input: UserProfileInput): string {
  const today = new Date().toISOString().split('T')[0]
  return `# Target User Profile
version: 1
last_updated: ${today}
human_confirmed: false

## Demographics
${input.description}

## Core Needs (priority ordered)
1. (To be determined through research and human input)

## Pain Points
1. (To be determined through research)

## Usage Patterns
- typical_session_duration: unknown
- frequency: unknown
- context: unknown

## Preferences
- ui_style: unknown
- interaction_model: unknown

## Anti-Needs (things the user explicitly does NOT want)
1. (To be determined)

## Research Findings
- (No research conducted yet)

## Version History
- v1: Initial version from project setup
`
}

interface UserContextInput {
  projectName: string
  description: string
  techStack: string
  workflow: string
}

export function userContextTemplate(input: UserContextInput): string {
  return `# User Context

## Project Name
${input.projectName}

## Description
${input.description}

## Tech Stack / Constraints
${input.techStack}

## Preferred Workflow
${input.workflow}

## Additional Requirements
(None specified yet. Human can add requirements here or via crewpilot feedback.)
`
}

export function projectContextTemplate(): string {
  return `# Project Context

## Architecture
TODO: Describe the project architecture. This will be auto-filled if you ran crewpilot init --existing, or filled in by the Team Lead after analyzing the codebase.

## Key Technologies
TODO

## Directory Structure
TODO

## Current State
New project — no existing code.
`
}

export function sessionRecoveryTemplate(): string {
  return `# Session Recovery Instructions

Execute these recovery steps in order:

1. Read \`.team-config/target-user-profile.md\` to restore your User Proxy persona
2. Read \`.team-config/state-snapshot.md\` to understand the last known state
3. Read \`.planning/STATE.md\` (if it exists) to understand GSD/Superpowers progress
4. Check for active Runner tmux panes:
   - Read \`.team-config/runner-pane-id.txt\` for pane IDs
   - Run \`tmux list-panes\` to verify which panes are alive
   - If alive: capture-pane, check state, resume polling
   - If dead and work incomplete: launch new Runner, resume from last phase
   - If dead and work complete: proceed to review
5. Check \`.team-config/human-inbox.md\` for messages sent during downtime

## Current Project Phase
(Not yet started)

## Current Workflow
(Not yet selected)

## Last Snapshot Time
(No snapshots yet)

## Pending Items
- [ ] Initial project setup
`
}

export function communicationLogTemplate(): string {
  return `# Communication Log

This file records all Q&A interactions between the Team Lead and Runners.

Format:
## {timestamp} | {workflow} {phase} | Phase {N}
Q: "{question}"
A: (User Proxy) "{answer}"
Basis: {source of decision}

---

(No interactions recorded yet)
`
}

export function humanInboxTemplate(): string {
  return `# Human Inbox

Write messages here for the Team Lead to pick up on its next polling cycle.
You can also use: crewpilot feedback "your message"

Messages are processed in order. Add new messages at the bottom.

---

(No messages yet)
`
}

export function claudeMdAppend(): string {
  return `

## Crewpilot Team Configuration

You are the Team Lead in a Crewpilot agent team framework.
Read \`.team-config/team-lead-persona.md\` for your complete behavioral specification.
Read \`.team-config/target-user-profile.md\` for the target user profile.
Read \`.team-config/USER-CONTEXT.md\` for project context and user requirements.

You MUST follow the Team Lead persona instructions precisely.
`
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/templates.test.ts`
Expected: All 14 tests PASS

**Step 5: Commit**

```bash
git add src/templates.ts src/__tests__/templates.test.ts
git commit -m "feat: add all template generators for .team-config files"
```

---

### Task 7: Scaffold Module (`scaffold.ts`)

**Files:**
- Create: `src/scaffold.ts`
- Create: `src/__tests__/scaffold.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/scaffold.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scaffoldTeamConfig } from '../scaffold.js'

describe('scaffoldTeamConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates .team-config directory with all expected files', () => {
    scaffoldTeamConfig(tmpDir, {
      projectName: 'TestApp',
      description: 'A test application',
      userDescription: 'Developers aged 25-40',
      techStack: 'TypeScript + React',
      workflow: 'gsd',
    })

    const configDir = path.join(tmpDir, '.team-config')
    expect(fs.existsSync(configDir)).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'team-lead-persona.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'target-user-profile.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'USER-CONTEXT.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'project-context.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'session-recovery.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'state-snapshot.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'communication-log.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'human-inbox.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'human-directives.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'needs-human-decision.md'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'runner-pane-id.txt'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'user-research'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'evaluations'))).toBe(true)
    expect(fs.existsSync(path.join(configDir, 'archives'))).toBe(true)
  })

  it('writes user description into target-user-profile.md', () => {
    scaffoldTeamConfig(tmpDir, {
      projectName: 'TestApp',
      description: 'A test app',
      userDescription: 'Power users who love shortcuts',
      techStack: 'Rust',
      workflow: 'superpowers',
    })

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'target-user-profile.md'),
      'utf-8'
    )
    expect(content).toContain('Power users who love shortcuts')
  })

  it('writes project info into USER-CONTEXT.md', () => {
    scaffoldTeamConfig(tmpDir, {
      projectName: 'MyProject',
      description: 'My cool project',
      userDescription: 'Everyone',
      techStack: 'Python + FastAPI',
      workflow: 'gsd',
    })

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
    expect(content).toContain('MyProject')
    expect(content).toContain('My cool project')
    expect(content).toContain('Python + FastAPI')
    expect(content).toContain('gsd')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/scaffold.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/scaffold.ts
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

  // Create directories
  fs.mkdirSync(configDir, { recursive: true })
  fs.mkdirSync(path.join(configDir, 'user-research'), { recursive: true })
  fs.mkdirSync(path.join(configDir, 'evaluations'), { recursive: true })
  fs.mkdirSync(path.join(configDir, 'archives'), { recursive: true })

  // Write template files
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
}

export function teamConfigExists(projectDir: string): boolean {
  return fs.existsSync(path.join(projectDir, '.team-config'))
}

export function appendClaudeMd(projectDir: string, content: string): void {
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md')
  if (fs.existsSync(claudeMdPath)) {
    fs.appendFileSync(claudeMdPath, content, 'utf-8')
  } else {
    fs.writeFileSync(claudeMdPath, content, 'utf-8')
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/scaffold.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/scaffold.ts src/__tests__/scaffold.test.ts
git commit -m "feat: add scaffold module for .team-config directory creation"
```

---

### Task 8: Init Command

**Files:**
- Create: `src/commands/init.ts`
- Create: `src/__tests__/commands/init.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/commands/init.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runInit } from '../../commands/init.js'

// Mock inquirer prompts
vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
}))

// Mock prereqs
vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

import { input, select, confirm } from '@inquirer/prompts'

const mockInput = vi.mocked(input)
const mockSelect = vi.mocked(select)
const mockConfirm = vi.mocked(confirm)

describe('runInit', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-init-test-'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates .team-config with prompted values', async () => {
    mockInput
      .mockResolvedValueOnce('TestProject')    // project name
      .mockResolvedValueOnce('A test project') // description
      .mockResolvedValueOnce('Developers')     // target user
      .mockResolvedValueOnce('TypeScript')     // tech stack
    mockSelect.mockResolvedValueOnce('gsd')    // workflow

    await runInit({ cwd: tmpDir })

    expect(fs.existsSync(path.join(tmpDir, '.team-config'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.team-config', 'team-lead-persona.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true)
  })

  it('uses --name flag to skip project name prompt', async () => {
    mockInput
      .mockResolvedValueOnce('A test project') // description
      .mockResolvedValueOnce('Developers')     // target user
      .mockResolvedValueOnce('TypeScript')     // tech stack
    mockSelect.mockResolvedValueOnce('gsd')    // workflow

    await runInit({ cwd: tmpDir, name: 'FlagProject' })

    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
    expect(content).toContain('FlagProject')
  })

  it('uses --workflow flag to skip workflow prompt', async () => {
    mockInput
      .mockResolvedValueOnce('TestProject')
      .mockResolvedValueOnce('A project')
      .mockResolvedValueOnce('Users')
      .mockResolvedValueOnce('Node.js')

    await runInit({ cwd: tmpDir, workflow: 'superpowers' })

    expect(mockSelect).not.toHaveBeenCalled()
    const content = fs.readFileSync(
      path.join(tmpDir, '.team-config', 'USER-CONTEXT.md'),
      'utf-8'
    )
    expect(content).toContain('superpowers')
  })

  it('asks to overwrite when .team-config already exists', async () => {
    fs.mkdirSync(path.join(tmpDir, '.team-config'))
    mockConfirm.mockResolvedValueOnce(false) // decline overwrite

    await runInit({ cwd: tmpDir })

    // Should have asked confirm and then aborted (no new files written)
    expect(mockConfirm).toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/init.test.ts`
Expected: FAIL — module not found

**Step 3: Write the init command**

```typescript
// src/commands/init.ts
import path from 'node:path'
import { input, select, confirm } from '@inquirer/prompts'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { scaffoldTeamConfig, teamConfigExists, appendClaudeMd } from '../scaffold.js'
import { claudeMdAppend } from '../templates.js'
import { execFileSync } from 'node:child_process'

interface InitOptions {
  cwd?: string
  name?: string
  workflow?: string
  existing?: boolean
}

export async function runInit(options: InitOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()

  if (options.existing) {
    checkPrereqs(['claude'])
  }

  // Check for existing .team-config
  if (teamConfigExists(cwd)) {
    const overwrite = await confirm({
      message: '.team-config/ already exists. Overwrite?',
      default: false,
    })
    if (!overwrite) {
      console.log(chalk.yellow('Init cancelled.'))
      return
    }
  }

  // Gather project info
  const projectName = options.name ?? await input({
    message: 'Project name',
    default: path.basename(cwd),
  })

  const description = await input({
    message: 'Project description',
  })

  const userDescription = await input({
    message: 'Target user description (who is this for?)',
  })

  const techStack = await input({
    message: 'Tech stack / constraints',
  })

  const workflow = options.workflow ?? await select({
    message: 'Preferred workflow',
    choices: [
      { name: 'GSD (spec-driven development)', value: 'gsd' },
      { name: 'Superpowers (feature-driven + TDD)', value: 'superpowers' },
      { name: 'Decide later', value: 'ask-me-later' },
    ],
  })

  // Scaffold .team-config
  scaffoldTeamConfig(cwd, {
    projectName,
    description,
    userDescription,
    techStack,
    workflow,
  })

  // Append to CLAUDE.md
  appendClaudeMd(cwd, claudeMdAppend())

  // If --existing, scan codebase with Claude
  if (options.existing) {
    console.log(chalk.blue('Scanning codebase with Claude Code...'))
    try {
      const analysis = execFileSync('claude', [
        '--print',
        '-p',
        'Analyze this codebase directory structure, detect languages, frameworks, and architecture patterns. Output a concise markdown summary suitable for a project-context.md file. Do not include file listings longer than 20 items.',
      ], {
        cwd,
        stdio: 'pipe',
        timeout: 60000,
      }).toString()

      const contextPath = path.join(cwd, '.team-config', 'project-context.md')
      const { writeFileSync } = await import('node:fs')
      writeFileSync(contextPath, `# Project Context\n\n${analysis}`, 'utf-8')
      console.log(chalk.green('Codebase analysis written to .team-config/project-context.md'))
    } catch (err) {
      console.log(chalk.yellow('Codebase scan failed. You can fill in project-context.md manually.'))
    }
  }

  console.log(chalk.green(`\nCrewpilot initialized for "${projectName}"!`))
  console.log(chalk.gray('Created .team-config/ with all template files'))
  console.log(chalk.gray('Updated CLAUDE.md with Team Lead directives'))
  console.log(`\nNext: ${chalk.cyan('crewpilot start')} to launch the framework`)
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/init.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/commands/init.ts src/__tests__/commands/init.test.ts
git commit -m "feat: add crewpilot init command with interactive prompts"
```

---

### Task 9: Start Command

**Files:**
- Create: `src/commands/start.ts`
- Create: `src/__tests__/commands/start.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/commands/start.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  createSession: vi.fn(),
  sendKeys: vi.fn(),
  sendEnter: vi.fn(),
  sendTextInput: vi.fn(),
  attachSession: vi.fn(),
  sleepMs: vi.fn(),
}))

import { sessionExists, createSession, sendKeys, sendTextInput, attachSession, sleepMs } from '../../tmux.js'
import { runStart } from '../../commands/start.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockCreateSession = vi.mocked(createSession)
const mockSendKeys = vi.mocked(sendKeys)
const mockSendTextInput = vi.mocked(sendTextInput)
const mockAttachSession = vi.mocked(attachSession)
const mockSleepMs = vi.mocked(sleepMs)

describe('runStart', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-start-test-'))
    vi.clearAllMocks()
    mockSessionExists.mockReturnValue(false)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('errors if .team-config does not exist', async () => {
    await expect(runStart({ cwd: tmpDir })).rejects.toThrow(/crewpilot init/)
  })

  it('creates tmux session and launches Claude Code', async () => {
    // Create .team-config with USER-CONTEXT.md
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )

    await runStart({ cwd: tmpDir, noAttach: true })

    expect(mockCreateSession).toHaveBeenCalledWith(
      'crewpilot-testapp',
      tmpDir
    )
    // Should send claude command
    expect(mockSendKeys).toHaveBeenCalled()
    // Should send bootstrap prompt
    expect(mockSendTextInput).toHaveBeenCalled()
  })

  it('does not attach when --no-attach is set', async () => {
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )

    await runStart({ cwd: tmpDir, noAttach: true })

    expect(mockAttachSession).not.toHaveBeenCalled()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/start.test.ts`
Expected: FAIL — module not found

**Step 3: Write the start command**

```typescript
// src/commands/start.ts
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName } from '../utils.js'
import {
  sessionExists,
  createSession,
  sendKeys,
  sendEnter,
  sendTextInput,
  attachSession,
  sleepMs,
} from '../tmux.js'

const BOOTSTRAP_PROMPT = `Read .team-config/team-lead-persona.md, then .team-config/target-user-profile.md, then .team-config/USER-CONTEXT.md. You are the Team Lead. Begin the startup workflow as described in your persona.`

interface StartOptions {
  cwd?: string
  noAttach?: boolean
}

export async function runStart(options: StartOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()

  checkPrereqs(['tmux', 'claude'])

  if (!teamConfigExists(cwd)) {
    throw new Error(
      `No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`
    )
  }

  // Read project name
  const userContextPath = path.join(cwd, '.team-config', 'USER-CONTEXT.md')
  const userContext = fs.readFileSync(userContextPath, 'utf-8')
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)

  // Check for existing session
  if (sessionExists(sessionName)) {
    const action = await confirm({
      message: `Session "${sessionName}" already exists. Attach to it?`,
      default: true,
    })
    if (action) {
      attachSession(sessionName)
      return
    }
    // If they don't want to attach, we can't create a duplicate
    console.log(chalk.yellow(`Use ${chalk.cyan('crewpilot stop')} first to stop the existing session.`))
    return
  }

  // Create tmux session
  console.log(chalk.blue(`Creating tmux session: ${sessionName}`))
  createSession(sessionName, cwd)

  // Launch Claude Code in pane 0
  sendKeys(`${sessionName}:0`, `claude --dangerously-skip-permissions`)
  sendEnter(`${sessionName}:0`)
  sleepMs(4000) // Wait for Claude Code to initialize

  // Inject bootstrap prompt
  sendTextInput(`${sessionName}:0`, BOOTSTRAP_PROMPT)

  console.log(chalk.green(`\nCrewpilot started! Session: ${sessionName}`))
  console.log('')
  console.log(chalk.gray('How to interact:'))
  console.log(chalk.gray(`  Attach:   tmux attach -t ${sessionName}`))
  console.log(chalk.gray(`  Feedback: crewpilot feedback "your message"`))
  console.log(chalk.gray(`  Status:   crewpilot status`))
  console.log(chalk.gray(`  Stop:     crewpilot stop`))

  if (!options.noAttach) {
    console.log(chalk.blue('\nAttaching to session...'))
    attachSession(sessionName)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/start.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/commands/start.ts src/__tests__/commands/start.test.ts
git commit -m "feat: add crewpilot start command with tmux session management"
```

---

### Task 10: Resume Command

**Files:**
- Create: `src/commands/resume.ts`
- Create: `src/__tests__/commands/resume.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/commands/resume.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  createSession: vi.fn(),
  sendKeys: vi.fn(),
  sendEnter: vi.fn(),
  sendTextInput: vi.fn(),
  attachSession: vi.fn(),
  listPanes: vi.fn(),
  sleepMs: vi.fn(),
}))

import { sessionExists, createSession, sendKeys, sendTextInput, attachSession, listPanes } from '../../tmux.js'
import { runResume } from '../../commands/resume.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockCreateSession = vi.mocked(createSession)
const mockSendKeys = vi.mocked(sendKeys)
const mockSendTextInput = vi.mocked(sendTextInput)
const mockAttachSession = vi.mocked(attachSession)
const mockListPanes = vi.mocked(listPanes)

describe('runResume', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-resume-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('attaches to existing session if it has live panes', async () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([{ id: '%0', active: true, command: 'claude' }])

    await runResume({ cwd: tmpDir })

    expect(mockAttachSession).toHaveBeenCalledWith('crewpilot-testapp')
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('creates new session with --continue flag by default', async () => {
    mockSessionExists.mockReturnValue(false)

    await runResume({ cwd: tmpDir, noAttach: true })

    expect(mockCreateSession).toHaveBeenCalled()
    // Should use claude --continue
    const sendKeysCall = mockSendKeys.mock.calls[0]
    expect(sendKeysCall[1]).toContain('--continue')
  })

  it('creates new session without --continue when --fresh', async () => {
    mockSessionExists.mockReturnValue(false)

    await runResume({ cwd: tmpDir, noAttach: true, fresh: true })

    expect(mockCreateSession).toHaveBeenCalled()
    const sendKeysCall = mockSendKeys.mock.calls[0]
    expect(sendKeysCall[1]).not.toContain('--continue')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/resume.test.ts`
Expected: FAIL — module not found

**Step 3: Write the resume command**

```typescript
// src/commands/resume.ts
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName } from '../utils.js'
import {
  sessionExists,
  createSession,
  listPanes,
  sendKeys,
  sendEnter,
  sendTextInput,
  attachSession,
  sleepMs,
} from '../tmux.js'

const RECOVERY_PROMPT = `Read .team-config/session-recovery.md and follow the recovery instructions. Read .team-config/team-lead-persona.md to restore your Team Lead persona. Resume work from where you left off.`

interface ResumeOptions {
  cwd?: string
  fresh?: boolean
  noAttach?: boolean
}

export async function runResume(options: ResumeOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()

  checkPrereqs(['tmux', 'claude'])

  if (!teamConfigExists(cwd)) {
    throw new Error(
      `No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`
    )
  }

  const userContextPath = path.join(cwd, '.team-config', 'USER-CONTEXT.md')
  const userContext = fs.readFileSync(userContextPath, 'utf-8')
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)

  // Check for existing session
  if (sessionExists(sessionName)) {
    const panes = listPanes(sessionName)
    if (panes.length > 0) {
      console.log(chalk.green(`Session "${sessionName}" is alive with ${panes.length} pane(s). Attaching...`))
      attachSession(sessionName)
      return
    }
  }

  // Create new session
  console.log(chalk.blue(`Creating new session: ${sessionName}`))
  createSession(sessionName, cwd)

  // Launch Claude Code
  const claudeCmd = options.fresh
    ? 'claude --dangerously-skip-permissions'
    : 'claude --continue --dangerously-skip-permissions'

  sendKeys(`${sessionName}:0`, claudeCmd)
  sendEnter(`${sessionName}:0`)
  sleepMs(4000)

  // Inject recovery prompt
  sendTextInput(`${sessionName}:0`, RECOVERY_PROMPT)

  console.log(chalk.green(`\nCrewpilot resumed! Session: ${sessionName}`))
  console.log(chalk.gray(`Mode: ${options.fresh ? 'fresh start with recovery' : 'continuing last conversation'}`))

  if (!options.noAttach) {
    console.log(chalk.blue('\nAttaching to session...'))
    attachSession(sessionName)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/resume.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/commands/resume.ts src/__tests__/commands/resume.test.ts
git commit -m "feat: add crewpilot resume command with --continue and --fresh modes"
```

---

### Task 11: Status Command

**Files:**
- Create: `src/commands/status.ts`
- Create: `src/__tests__/commands/status.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/commands/status.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  listPanes: vi.fn(),
}))

import { sessionExists, listPanes } from '../../tmux.js'
import { getStatusInfo } from '../../commands/status.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockListPanes = vi.mocked(listPanes)

describe('getStatusInfo', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-status-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns status with session info when session is active', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
      { id: '%1', active: false, command: 'claude' },
    ])
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'state-snapshot.md'),
      'Phase: GSD Execute Phase 3\nRunner: Active',
      'utf-8'
    )

    const info = getStatusInfo(tmpDir)
    expect(info.sessionActive).toBe(true)
    expect(info.paneCount).toBe(2)
    expect(info.stateSnapshot).toContain('Phase 3')
  })

  it('returns status without session when inactive', () => {
    mockSessionExists.mockReturnValue(false)
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'state-snapshot.md'),
      '',
      'utf-8'
    )

    const info = getStatusInfo(tmpDir)
    expect(info.sessionActive).toBe(false)
    expect(info.paneCount).toBe(0)
  })

  it('reads needs-human-decision.md', () => {
    mockSessionExists.mockReturnValue(false)
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'state-snapshot.md'),
      '',
      'utf-8'
    )
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'needs-human-decision.md'),
      'Should we use PostgreSQL or SQLite?',
      'utf-8'
    )

    const info = getStatusInfo(tmpDir)
    expect(info.pendingDecisions).toContain('PostgreSQL')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/status.test.ts`
Expected: FAIL — module not found

**Step 3: Write the status command**

```typescript
// src/commands/status.ts
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName } from '../utils.js'
import { sessionExists, listPanes } from '../tmux.js'

export interface StatusInfo {
  projectName: string
  sessionName: string
  sessionActive: boolean
  paneCount: number
  stateSnapshot: string
  gsdProgress: string
  pendingDecisions: string
}

function readFileOrEmpty(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch {
    return ''
  }
}

export function getStatusInfo(cwd: string): StatusInfo {
  const userContext = readFileOrEmpty(path.join(cwd, '.team-config', 'USER-CONTEXT.md'))
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)

  const isActive = sessionExists(sessionName)
  const panes = isActive ? listPanes(sessionName) : []

  return {
    projectName,
    sessionName,
    sessionActive: isActive,
    paneCount: panes.length,
    stateSnapshot: readFileOrEmpty(path.join(cwd, '.team-config', 'state-snapshot.md')),
    gsdProgress: readFileOrEmpty(path.join(cwd, '.planning', 'STATE.md')),
    pendingDecisions: readFileOrEmpty(path.join(cwd, '.team-config', 'needs-human-decision.md')),
  }
}

export function runStatus(cwd?: string): void {
  const dir = cwd ?? process.cwd()

  if (!teamConfigExists(dir)) {
    console.log(chalk.red(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`))
    return
  }

  const info = getStatusInfo(dir)

  console.log(chalk.bold(`\n── Crewpilot Status: ${info.projectName} ──\n`))

  // Session info
  if (info.sessionActive) {
    console.log(chalk.green(`Session: ${info.sessionName} (active, ${info.paneCount} pane${info.paneCount !== 1 ? 's' : ''})`))
  } else {
    console.log(chalk.yellow(`Session: ${info.sessionName} (inactive)`))
  }

  // State snapshot
  if (info.stateSnapshot) {
    console.log(chalk.bold('\nLast Snapshot:'))
    console.log(chalk.gray(info.stateSnapshot))
  } else {
    console.log(chalk.gray('\nNo state snapshot available.'))
  }

  // GSD progress
  if (info.gsdProgress) {
    console.log(chalk.bold('\nGSD Progress:'))
    console.log(chalk.gray(info.gsdProgress))
  }

  // Pending decisions
  if (info.pendingDecisions) {
    console.log(chalk.bold.red('\nPending Decisions:'))
    console.log(chalk.yellow(info.pendingDecisions))
  } else {
    console.log(chalk.gray('\nPending Decisions: None'))
  }

  console.log('')
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/status.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/commands/status.ts src/__tests__/commands/status.test.ts
git commit -m "feat: add crewpilot status command"
```

---

### Task 12: Feedback Command

**Files:**
- Create: `src/commands/feedback.ts`
- Create: `src/__tests__/commands/feedback.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/commands/feedback.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/feedback.test.ts`
Expected: FAIL — module not found

**Step 3: Write the feedback command**

```typescript
// src/commands/feedback.ts
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { teamConfigExists } from '../scaffold.js'
import { formatTimestamp } from '../utils.js'

export function runFeedback(message: string, cwd?: string): void {
  const dir = cwd ?? process.cwd()

  if (!teamConfigExists(dir)) {
    throw new Error(
      `No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`
    )
  }

  const inboxPath = path.join(dir, '.team-config', 'human-inbox.md')
  const entry = `\n## [${formatTimestamp()}]\n${message}\n`

  fs.appendFileSync(inboxPath, entry, 'utf-8')

  console.log(chalk.green('Feedback sent. Team Lead will pick it up on next polling cycle.'))
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/feedback.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/commands/feedback.ts src/__tests__/commands/feedback.test.ts
git commit -m "feat: add crewpilot feedback command for async messaging"
```

---

### Task 13: Stop Command

**Files:**
- Create: `src/commands/stop.ts`
- Create: `src/__tests__/commands/stop.test.ts`

**Step 1: Write the failing test**

```typescript
// src/__tests__/commands/stop.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  killSession: vi.fn(),
  listPanes: vi.fn(),
  sendKeys: vi.fn(),
  sendEnter: vi.fn(),
  sleepMs: vi.fn(),
}))

import { sessionExists, killSession, listPanes, sendKeys, sendEnter, sleepMs } from '../../tmux.js'
import { runStop } from '../../commands/stop.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockKillSession = vi.mocked(killSession)
const mockListPanes = vi.mocked(listPanes)
const mockSendKeys = vi.mocked(sendKeys)
const mockSendEnter = vi.mocked(sendEnter)
const mockSleepMs = vi.mocked(sleepMs)

describe('runStop', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-stop-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '', 'utf-8')
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('errors if no active session', () => {
    mockSessionExists.mockReturnValue(false)
    expect(() => runStop(tmpDir)).toThrow(/No active/)
  })

  it('sends /exit to runner panes and kills session', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
      { id: '%1', active: false, command: 'claude' },
    ])
    fs.writeFileSync(
      path.join(tmpDir, '.team-config', 'runner-pane-id.txt'),
      '%1',
      'utf-8'
    )

    runStop(tmpDir)

    // Should send /exit to runner pane %1
    expect(mockSendKeys).toHaveBeenCalled()
    // Should kill session
    expect(mockKillSession).toHaveBeenCalledWith('crewpilot-testapp')
  })

  it('kills session even without runner panes', () => {
    mockSessionExists.mockReturnValue(true)
    mockListPanes.mockReturnValue([
      { id: '%0', active: true, command: 'claude' },
    ])

    runStop(tmpDir)

    expect(mockKillSession).toHaveBeenCalledWith('crewpilot-testapp')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/stop.test.ts`
Expected: FAIL — module not found

**Step 3: Write the stop command**

```typescript
// src/commands/stop.ts
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName } from '../utils.js'
import {
  sessionExists,
  killSession,
  listPanes,
  sendKeys,
  sendEnter,
  sleepMs,
} from '../tmux.js'

export function runStop(cwd?: string): void {
  const dir = cwd ?? process.cwd()

  checkPrereqs(['tmux'])

  if (!teamConfigExists(dir)) {
    throw new Error(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`)
  }

  const userContext = fs.readFileSync(
    path.join(dir, '.team-config', 'USER-CONTEXT.md'),
    'utf-8'
  )
  const projectName = getProjectName(userContext) ?? path.basename(dir)
  const sessionName = getSessionName(projectName)

  if (!sessionExists(sessionName)) {
    throw new Error(`No active session "${sessionName}". Nothing to stop.`)
  }

  console.log(chalk.blue(`Stopping session: ${sessionName}`))

  // Read runner pane IDs
  const runnerPanePath = path.join(dir, '.team-config', 'runner-pane-id.txt')
  const runnerPaneContent = fs.readFileSync(runnerPanePath, 'utf-8').trim()
  const runnerPaneIds = runnerPaneContent ? runnerPaneContent.split('\n').filter(Boolean) : []

  // Send /exit to each runner pane
  for (const paneId of runnerPaneIds) {
    try {
      console.log(chalk.gray(`Sending /exit to runner pane ${paneId}...`))
      sendKeys(paneId, '/exit')
      sendEnter(paneId)
      sleepMs(1000)
      sendEnter(paneId)
    } catch {
      // Pane may already be dead, that's fine
    }
  }

  if (runnerPaneIds.length > 0) {
    console.log(chalk.gray('Waiting for runners to shut down...'))
    sleepMs(5000)
  }

  // Send /exit to team lead pane (pane 0)
  try {
    const panes = listPanes(sessionName)
    if (panes.length > 0) {
      console.log(chalk.gray('Sending /exit to Team Lead...'))
      sendKeys(`${sessionName}:0`, '/exit')
      sendEnter(`${sessionName}:0`)
      sleepMs(1000)
      sendEnter(`${sessionName}:0`)
      sleepMs(3000)
    }
  } catch {
    // Session may already be closing
  }

  // Kill the tmux session
  try {
    killSession(sessionName)
  } catch {
    // Already dead
  }

  console.log(chalk.green(`\nCrewpilot stopped. State preserved in .team-config/`))
  console.log(chalk.gray(`Use ${chalk.cyan('crewpilot resume')} to continue later.`))
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/stop.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/commands/stop.ts src/__tests__/commands/stop.test.ts
git commit -m "feat: add crewpilot stop command with graceful shutdown"
```

---

### Task 14: CLI Entry Point (`index.ts`)

**Files:**
- Modify: `src/index.ts` (replace placeholder)

**Step 1: Write the CLI entry point**

```typescript
// src/index.ts
import { Command } from 'commander'
import { runInit } from './commands/init.js'
import { runStart } from './commands/start.js'
import { runResume } from './commands/resume.js'
import { runStatus } from './commands/status.js'
import { runFeedback } from './commands/feedback.js'
import { runStop } from './commands/stop.js'

const program = new Command()

program
  .name('crewpilot')
  .description('CLI tool that bootstraps and manages an AI Agent Team framework on top of Claude Code')
  .version('0.1.0')

program
  .command('init')
  .description('Initialize a new Crewpilot project')
  .option('--name <name>', 'Project name (skip prompt)')
  .option('--workflow <workflow>', 'Preferred workflow: gsd or superpowers (skip prompt)')
  .option('--existing', 'Scan existing codebase to auto-generate project-context.md')
  .action(async (opts) => {
    try {
      await runInit({
        name: opts.name,
        workflow: opts.workflow,
        existing: opts.existing,
      })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('start')
  .description('Launch the Crewpilot framework')
  .option('--no-attach', 'Do not attach to tmux session (background mode)')
  .action(async (opts) => {
    try {
      await runStart({ noAttach: !opts.attach })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('resume')
  .description('Resume an interrupted Crewpilot session')
  .option('--fresh', 'Start new conversation instead of continuing last one')
  .option('--no-attach', 'Do not attach to tmux session')
  .action(async (opts) => {
    try {
      await runResume({ fresh: opts.fresh, noAttach: !opts.attach })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('status')
  .description('Show current project status')
  .action(() => {
    try {
      runStatus()
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('feedback')
  .description('Send async feedback to the Team Lead')
  .argument('<message>', 'Feedback message')
  .action((message) => {
    try {
      runFeedback(message)
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program
  .command('stop')
  .description('Gracefully stop the Crewpilot framework')
  .action(() => {
    try {
      runStop()
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })

program.parse()
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Builds successfully, `dist/index.js` created with shebang

Run: `node dist/index.js --help`
Expected output showing all 6 commands:
```
Usage: crewpilot [options] [command]

CLI tool that bootstraps and manages an AI Agent Team framework on top of Claude Code

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  init            Initialize a new Crewpilot project
  start           Launch the Crewpilot framework
  resume          Resume an interrupted Crewpilot session
  status          Show current project status
  feedback        Send async feedback to the Team Lead
  stop            Gracefully stop the Crewpilot framework
  help [command]  display help for command
```

Run: `node dist/index.js init --help`
Expected: Shows init-specific options (--name, --workflow, --existing)

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire all commands into Commander CLI entry point"
```

---

### Task 15: Full Test Suite Run + Build Verification

**Files:**
- No new files

**Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass (approximately 30+ tests across 9 test files)

**Step 2: Run type checking**

Run: `npm run lint`
Expected: No TypeScript errors

**Step 3: Build**

Run: `npm run build`
Expected: Clean build, `dist/index.js` exists

**Step 4: Test global install locally**

Run: `npm link`
Run: `crewpilot --help`
Expected: Shows help with all commands

Run: `crewpilot --version`
Expected: 0.1.0

**Step 5: Quick smoke test of init command**

Run in a temporary directory:
```bash
cd /tmp && mkdir crewpilot-smoke-test && cd crewpilot-smoke-test
crewpilot init --name SmokeTest --workflow gsd
```
Expected: Interactive prompts for description, user, tech stack. Creates `.team-config/` and `CLAUDE.md`.

Verify files:
```bash
ls -la .team-config/
cat .team-config/team-lead-persona.md | head -20
cat CLAUDE.md
```

Clean up:
```bash
cd /tmp && rm -rf crewpilot-smoke-test
npm unlink -g crewpilot
```

**Step 6: Commit any fixes, then tag**

```bash
git add -A
git commit -m "chore: finalize v0.1.0 build and test suite"
git tag v0.1.0
```
