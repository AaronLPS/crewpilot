# Crewpilot v0.2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move tmux operations into CLI commands, fix 3 bugs, implement 8 improvements to make the Team Lead persona simpler and more reliable.

**Architecture:** CLI-first approach. New commands (`launch-runner`, `stop-runner`, `send-answer`) encapsulate tmux mechanics. Enhanced `watch` command writes structured state files. Team Lead persona reads JSON state files instead of doing raw `tmux capture-pane`. Singleton lockfile prevents duplicate Team Leads.

**Tech Stack:** TypeScript, Commander.js, tmux, Vitest, Node.js fs

---

### Task 1: Add `createWindow` function to tmux.ts

**Files:**
- Modify: `src/tmux.ts`
- Test: `src/__tests__/tmux.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/tmux.test.ts`, add a new `describe` block after the `splitWindowHorizontal` block:

```typescript
describe('createWindow', () => {
  it('creates a detached window and returns pane ID', () => {
    mockExecFileSync
      .mockReturnValueOnce(Buffer.from(''))  // new-window
      .mockReturnValueOnce(Buffer.from('%3\n'))  // display-message
    const paneId = createWindow('crewpilot-myapp')
    expect(paneId).toBe('%3')
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'tmux',
      ['new-window', '-d', '-t', 'crewpilot-myapp', '-P', '-F', '#{pane_id}'],
      expect.any(Object)
    )
  })
})
```

Update the import at the top of the test file to include `createWindow`:

```typescript
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
  createWindow,
} from '../tmux.js'
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tmux.test.ts`
Expected: FAIL — `createWindow` is not exported from tmux.js

**Step 3: Write minimal implementation**

In `src/tmux.ts`, add after the `splitWindowHorizontal` function:

```typescript
export function createWindow(session: string): string {
  return tmux('new-window', '-d', '-t', session, '-P', '-F', '#{pane_id}').trim()
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tmux.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tmux.ts src/__tests__/tmux.test.ts
git commit -m "feat: add createWindow function to tmux module"
```

---

### Task 2: Add `sendOption` function to tmux.ts

**Files:**
- Modify: `src/tmux.ts`
- Test: `src/__tests__/tmux.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/tmux.test.ts`, add:

```typescript
describe('sendOption', () => {
  it('sends Enter for option 1 (default)', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''))
    sendOption('%1', 1)
    const sendKeysCalls = mockExecFileSync.mock.calls.filter(
      call => call[1] && (call[1] as string[])[0] === 'send-keys'
    )
    // Option 1 = just Enter (no Down presses)
    expect(sendKeysCalls.length).toBe(1)
    expect(sendKeysCalls[0][1]).toEqual(['send-keys', '-t', '%1', 'Enter'])
  })

  it('sends Down keys then Enter for option 3', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''))
    sendOption('%1', 3)
    const sendKeysCalls = mockExecFileSync.mock.calls.filter(
      call => call[1] && (call[1] as string[])[0] === 'send-keys'
    )
    // Option 3 = 2 Down presses + 1 Enter = 3 send-keys calls
    expect(sendKeysCalls.length).toBe(3)
    expect(sendKeysCalls[0][1]).toEqual(['send-keys', '-t', '%1', 'Down'])
    expect(sendKeysCalls[1][1]).toEqual(['send-keys', '-t', '%1', 'Down'])
    expect(sendKeysCalls[2][1]).toEqual(['send-keys', '-t', '%1', 'Enter'])
  })

  it('throws for option less than 1', () => {
    expect(() => sendOption('%1', 0)).toThrow('Option number must be >= 1')
  })
})
```

Update the import to include `sendOption`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tmux.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

In `src/tmux.ts`, add:

```typescript
export function sendOption(paneId: string, optionNumber: number): void {
  if (optionNumber < 1) throw new Error('Option number must be >= 1')
  for (let i = 1; i < optionNumber; i++) {
    tmux('send-keys', '-t', paneId, 'Down')
    sleepMs(500)
  }
  tmux('send-keys', '-t', paneId, 'Enter')
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tmux.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tmux.ts src/__tests__/tmux.test.ts
git commit -m "feat: add sendOption function for AskUserQuestion navigation"
```

---

### Task 3: Add `getDefaultBranch` to utils.ts (BUG-3)

**Files:**
- Modify: `src/utils.ts`
- Test: `src/__tests__/utils.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/utils.test.ts`, add at the top:

```typescript
import { execFileSync } from 'node:child_process'
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))
const mockExecFileSync = vi.mocked(execFileSync)
```

Add the describe block:

```typescript
describe('getDefaultBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns current branch from git symbolic-ref', () => {
    mockExecFileSync.mockReturnValueOnce(Buffer.from('main\n'))
    expect(getDefaultBranch('/tmp/test')).toBe('main')
  })

  it('returns master as fallback if git fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not a git repo')
    })
    expect(getDefaultBranch('/tmp/test')).toBe('master')
  })

  it('trims whitespace from branch name', () => {
    mockExecFileSync.mockReturnValueOnce(Buffer.from('  develop  \n'))
    expect(getDefaultBranch('/tmp/test')).toBe('develop')
  })
})
```

Update import to include `getDefaultBranch`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/utils.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

In `src/utils.ts`, add:

```typescript
import { execFileSync } from 'node:child_process'

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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils.ts src/__tests__/utils.test.ts
git commit -m "feat: add getDefaultBranch utility for branch detection (BUG-3)"
```

---

### Task 4: Add lockfile helpers to utils.ts (IMP-1)

**Files:**
- Modify: `src/utils.ts`
- Test: `src/__tests__/utils.test.ts`

**Step 1: Write the failing tests**

In `src/__tests__/utils.test.ts`, add:

```typescript
describe('lockfile management', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-lock-test-'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('writeLockfile', () => {
    it('writes a lockfile with pane ID and timestamp', () => {
      writeLockfile(tmpDir, '.team-lead-lock', '%0')
      const lockPath = path.join(tmpDir, '.team-config', '.team-lead-lock')
      const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))
      expect(content.paneId).toBe('%0')
      expect(content.pid).toBe(process.pid)
      expect(content.startedAt).toBeDefined()
    })
  })

  describe('readLockfile', () => {
    it('returns null if lockfile does not exist', () => {
      expect(readLockfile(tmpDir, '.team-lead-lock')).toBeNull()
    })

    it('returns parsed lockfile data', () => {
      const configDir = path.join(tmpDir, '.team-config')
      fs.mkdirSync(configDir, { recursive: true })
      const lockData = { paneId: '%0', pid: 123, startedAt: new Date().toISOString() }
      fs.writeFileSync(path.join(configDir, '.team-lead-lock'), JSON.stringify(lockData))
      const result = readLockfile(tmpDir, '.team-lead-lock')
      expect(result?.paneId).toBe('%0')
    })

    it('returns null for stale lockfiles (>24h)', () => {
      const configDir = path.join(tmpDir, '.team-config')
      fs.mkdirSync(configDir, { recursive: true })
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      const lockData = { paneId: '%0', pid: 123, startedAt: staleDate }
      fs.writeFileSync(path.join(configDir, '.team-lead-lock'), JSON.stringify(lockData))
      expect(readLockfile(tmpDir, '.team-lead-lock')).toBeNull()
    })
  })

  describe('removeLockfile', () => {
    it('removes the lockfile', () => {
      const configDir = path.join(tmpDir, '.team-config')
      fs.mkdirSync(configDir, { recursive: true })
      fs.writeFileSync(path.join(configDir, '.team-lead-lock'), '{}')
      removeLockfile(tmpDir, '.team-lead-lock')
      expect(fs.existsSync(path.join(configDir, '.team-lead-lock'))).toBe(false)
    })

    it('does not throw if lockfile does not exist', () => {
      expect(() => removeLockfile(tmpDir, '.team-lead-lock')).not.toThrow()
    })
  })
})
```

Update imports to include `writeLockfile`, `readLockfile`, `removeLockfile`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/utils.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

In `src/utils.ts`, add:

```typescript
import fs from 'node:fs'

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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils.ts src/__tests__/utils.test.ts
git commit -m "feat: add lockfile management utilities (IMP-1)"
```

---

### Task 5: Implement `crewpilot launch-runner` command (BUG-1, IMP-4)

**Files:**
- Create: `src/commands/launch-runner.ts`
- Test: `src/__tests__/commands/launch-runner.test.ts`
- Modify: `src/index.ts`

**Step 1: Write the failing test**

Create `src/__tests__/commands/launch-runner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../scaffold.js', () => ({
  teamConfigExists: vi.fn().mockReturnValue(true),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn(),
  createWindow: vi.fn(),
  sendKeys: vi.fn(),
  sendEnter: vi.fn(),
  sendTextInput: vi.fn(),
  sleepMs: vi.fn(),
  listPanes: vi.fn().mockReturnValue([]),
}))

import { sessionExists, createWindow, sendKeys, sendEnter, sendTextInput, sleepMs, listPanes } from '../../tmux.js'
import { runLaunchRunner } from '../../commands/launch-runner.js'

const mockSessionExists = vi.mocked(sessionExists)
const mockCreateWindow = vi.mocked(createWindow)
const mockSendKeys = vi.mocked(sendKeys)
const mockSendEnter = vi.mocked(sendEnter)
const mockSendTextInput = vi.mocked(sendTextInput)
const mockSleepMs = vi.mocked(sleepMs)
const mockListPanes = vi.mocked(listPanes)

describe('runLaunchRunner', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-launch-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '', 'utf-8')
    vi.clearAllMocks()
    mockSessionExists.mockReturnValue(true)
    mockCreateWindow.mockReturnValue('%5')
    mockListPanes.mockReturnValue([])
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('errors if no .team-config found', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-empty-'))
    const { teamConfigExists } = await import('../../scaffold.js')
    vi.mocked(teamConfigExists).mockReturnValueOnce(false)
    await expect(runLaunchRunner({ cwd: emptyDir })).rejects.toThrow(/crewpilot init/)
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })

  it('errors if session is not active', async () => {
    mockSessionExists.mockReturnValue(false)
    await expect(runLaunchRunner({ cwd: tmpDir })).rejects.toThrow(/not active/)
  })

  it('creates a window and launches claude with gsd workflow', async () => {
    await runLaunchRunner({ cwd: tmpDir, workflow: 'gsd' })
    expect(mockCreateWindow).toHaveBeenCalledWith('crewpilot-testapp')
    expect(mockSendKeys).toHaveBeenCalled()
    // Verify runner-pane-id.txt was written
    const paneContent = fs.readFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), 'utf-8')
    expect(paneContent.trim()).toBe('%5')
  })

  it('creates a window and launches claude with superpowers workflow', async () => {
    await runLaunchRunner({ cwd: tmpDir, workflow: 'superpowers', prompt: 'Build a todo app' })
    expect(mockCreateWindow).toHaveBeenCalled()
    expect(mockSendTextInput).toHaveBeenCalled()
  })

  it('rejects if runner pane already exists and is alive', async () => {
    fs.writeFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), '%3\n', 'utf-8')
    mockListPanes.mockReturnValue([{ id: '%3', active: true, command: 'claude' }])
    await expect(runLaunchRunner({ cwd: tmpDir })).rejects.toThrow(/already running/)
  })

  it('proceeds if runner pane file exists but pane is dead', async () => {
    fs.writeFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), '%3\n', 'utf-8')
    mockListPanes.mockReturnValue([]) // pane not in list = dead
    await runLaunchRunner({ cwd: tmpDir, workflow: 'gsd' })
    expect(mockCreateWindow).toHaveBeenCalled()
  })

  it('writes runner lock file', async () => {
    await runLaunchRunner({ cwd: tmpDir, workflow: 'gsd' })
    const lockPath = path.join(tmpDir, '.team-config', '.runner-lock')
    expect(fs.existsSync(lockPath)).toBe(true)
    const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))
    expect(lockData.paneId).toBe('%5')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/launch-runner.test.ts`
Expected: FAIL — module does not exist

**Step 3: Write minimal implementation**

Create `src/commands/launch-runner.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName, writeLockfile } from '../utils.js'
import {
  sessionExists,
  createWindow,
  sendKeys,
  sendEnter,
  sendTextInput,
  sleepMs,
  listPanes,
} from '../tmux.js'

interface LaunchRunnerOptions {
  cwd?: string
  workflow?: 'gsd' | 'superpowers'
  prompt?: string
}

export async function runLaunchRunner(options: LaunchRunnerOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()

  checkPrereqs(['tmux', 'claude'])

  if (!teamConfigExists(cwd)) {
    throw new Error(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`)
  }

  let userContext: string
  try {
    userContext = fs.readFileSync(path.join(cwd, '.team-config', 'USER-CONTEXT.md'), 'utf-8')
  } catch {
    throw new Error(`Cannot read .team-config/USER-CONTEXT.md. Run ${chalk.cyan('crewpilot init')} first.`)
  }
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)

  if (!sessionExists(sessionName)) {
    throw new Error(`Session "${sessionName}" is not active. Run ${chalk.cyan('crewpilot start')} first.`)
  }

  // Check if a runner is already alive
  const runnerPanePath = path.join(cwd, '.team-config', 'runner-pane-id.txt')
  try {
    const existingPaneId = fs.readFileSync(runnerPanePath, 'utf-8').trim()
    if (existingPaneId) {
      const panes = listPanes(sessionName)
      const isAlive = panes.some(p => p.id === existingPaneId)
      if (isAlive) {
        throw new Error(`Runner ${existingPaneId} is already running. Use ${chalk.cyan('crewpilot stop-runner')} first.`)
      }
    }
  } catch (err: any) {
    if (err.message?.includes('already running')) throw err
    // File missing or unreadable — proceed
  }

  // Create a detached window
  console.log(chalk.blue('Creating runner pane...'))
  const paneId = createWindow(sessionName)

  // Navigate to project directory
  sendKeys(paneId, `cd ${cwd}`)
  sendEnter(paneId)
  sleepMs(1000)

  // Launch Claude Code
  sendKeys(paneId, 'claude --dangerously-skip-permissions')
  sendEnter(paneId)
  sleepMs(4000)

  // Send workflow command
  if (options.workflow === 'gsd') {
    sendKeys(paneId, '/gsd:new-project')
    sendEnter(paneId)
    sleepMs(1000)
    sendEnter(paneId)
  } else if (options.workflow === 'superpowers') {
    const prompt = options.prompt ?? 'Start the project'
    sendTextInput(paneId, `${prompt} /superpowers:brainstorming`)
  } else if (options.prompt) {
    sendTextInput(paneId, options.prompt)
  }

  // Record pane ID
  fs.writeFileSync(runnerPanePath, paneId + '\n', 'utf-8')

  // Write runner lock
  writeLockfile(cwd, '.runner-lock', paneId)

  console.log(chalk.green(`Runner launched in pane ${paneId}`))
  console.log(chalk.gray(`Workflow: ${options.workflow ?? 'custom prompt'}`))
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/launch-runner.test.ts`
Expected: PASS

**Step 5: Register the command in index.ts**

In `src/index.ts`, add the import:

```typescript
import { runLaunchRunner } from './commands/launch-runner.js'
```

Add the command registration before `program.parse()`:

```typescript
program
  .command('launch-runner')
  .description('Launch a Runner in a new tmux pane (atomic, reliable)')
  .option('--workflow <workflow>', 'Workflow to start: gsd or superpowers')
  .option('--prompt <text>', 'Custom prompt to send to the Runner')
  .action(async (opts) => {
    try {
      await runLaunchRunner({
        workflow: opts.workflow,
        prompt: opts.prompt,
      })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/commands/launch-runner.ts src/__tests__/commands/launch-runner.test.ts src/index.ts
git commit -m "feat: add launch-runner command for reliable Runner creation (BUG-1, IMP-4)"
```

---

### Task 6: Implement `crewpilot stop-runner` command

**Files:**
- Create: `src/commands/stop-runner.ts`
- Test: `src/__tests__/commands/stop-runner.test.ts`
- Modify: `src/index.ts`

**Step 1: Write the failing test**

Create `src/__tests__/commands/stop-runner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../scaffold.js', () => ({
  teamConfigExists: vi.fn().mockReturnValue(true),
}))

vi.mock('../../tmux.js', () => ({
  sessionExists: vi.fn().mockReturnValue(true),
  sendKeys: vi.fn(),
  sendEnter: vi.fn(),
  sleepMs: vi.fn(),
  listPanes: vi.fn(),
}))

import { sendKeys, sendEnter, sleepMs, listPanes } from '../../tmux.js'
import { runStopRunner } from '../../commands/stop-runner.js'

const mockSendKeys = vi.mocked(sendKeys)
const mockSendEnter = vi.mocked(sendEnter)
const mockSleepMs = vi.mocked(sleepMs)
const mockListPanes = vi.mocked(listPanes)

describe('runStopRunner', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-stopr-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '%5\n', 'utf-8')
    vi.clearAllMocks()
    mockListPanes.mockReturnValue([{ id: '%5', active: true, command: 'claude' }])
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('sends /exit to the runner pane', () => {
    runStopRunner({ cwd: tmpDir })
    expect(mockSendKeys).toHaveBeenCalledWith('%5', '/exit')
    expect(mockSendEnter).toHaveBeenCalled()
  })

  it('clears runner-pane-id.txt after stopping', () => {
    runStopRunner({ cwd: tmpDir })
    const content = fs.readFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), 'utf-8')
    expect(content.trim()).toBe('')
  })

  it('removes runner lock file', () => {
    const lockPath = path.join(tmpDir, '.team-config', '.runner-lock')
    fs.writeFileSync(lockPath, '{}')
    runStopRunner({ cwd: tmpDir })
    expect(fs.existsSync(lockPath)).toBe(false)
  })

  it('throws if no runner pane ID is recorded', () => {
    fs.writeFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), '', 'utf-8')
    expect(() => runStopRunner({ cwd: tmpDir })).toThrow(/no active runner/)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/stop-runner.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `src/commands/stop-runner.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName, removeLockfile } from '../utils.js'
import {
  sessionExists,
  sendKeys,
  sendEnter,
  sleepMs,
  listPanes,
} from '../tmux.js'

interface StopRunnerOptions {
  cwd?: string
  force?: boolean
}

export function runStopRunner(options: StopRunnerOptions = {}): void {
  const cwd = options.cwd ?? process.cwd()

  checkPrereqs(['tmux'])

  if (!teamConfigExists(cwd)) {
    throw new Error(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`)
  }

  const runnerPanePath = path.join(cwd, '.team-config', 'runner-pane-id.txt')
  let paneId: string
  try {
    paneId = fs.readFileSync(runnerPanePath, 'utf-8').trim()
  } catch {
    throw new Error('No runner-pane-id.txt found — no active runner.')
  }

  if (!paneId) {
    throw new Error('No pane ID in runner-pane-id.txt — no active runner.')
  }

  // Get session name for pane validation
  let userContext: string
  try {
    userContext = fs.readFileSync(path.join(cwd, '.team-config', 'USER-CONTEXT.md'), 'utf-8')
  } catch {
    throw new Error(`Cannot read .team-config/USER-CONTEXT.md.`)
  }
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)

  // Check if pane is actually alive
  const panes = listPanes(sessionName)
  const isAlive = panes.some(p => p.id === paneId)

  if (isAlive) {
    if (options.force) {
      // Force kill via tmux
      try {
        const { execFileSync } = require('node:child_process')
        execFileSync('tmux', ['kill-pane', '-t', paneId], { stdio: 'pipe' })
      } catch {
        // Already dead
      }
      console.log(chalk.yellow(`Force-killed runner pane ${paneId}`))
    } else {
      // Graceful shutdown
      console.log(chalk.blue(`Sending /exit to runner pane ${paneId}...`))
      sendKeys(paneId, '/exit')
      sendEnter(paneId)
      sleepMs(1000)
      sendEnter(paneId)
      sleepMs(3000)
      console.log(chalk.green(`Runner ${paneId} shutdown signal sent.`))
    }
  } else {
    console.log(chalk.gray(`Runner pane ${paneId} is already dead.`))
  }

  // Clean up
  fs.writeFileSync(runnerPanePath, '', 'utf-8')
  removeLockfile(cwd, '.runner-lock')
  console.log(chalk.green('Runner pane ID and lock cleaned up.'))
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/stop-runner.test.ts`
Expected: PASS

**Step 5: Register command in index.ts**

Add import and command registration for `stop-runner`:

```typescript
import { runStopRunner } from './commands/stop-runner.js'
```

```typescript
program
  .command('stop-runner')
  .description('Stop the active Runner pane')
  .option('--force', 'Force kill the Runner pane instead of graceful shutdown')
  .action((opts) => {
    try {
      runStopRunner({ force: opts.force })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/commands/stop-runner.ts src/__tests__/commands/stop-runner.test.ts src/index.ts
git commit -m "feat: add stop-runner command for graceful Runner shutdown"
```

---

### Task 7: Implement `crewpilot send-answer` command

**Files:**
- Create: `src/commands/send-answer.ts`
- Test: `src/__tests__/commands/send-answer.test.ts`
- Modify: `src/index.ts`

**Step 1: Write the failing test**

Create `src/__tests__/commands/send-answer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

vi.mock('../../prereqs.js', () => ({
  checkPrereqs: vi.fn(),
}))

vi.mock('../../scaffold.js', () => ({
  teamConfigExists: vi.fn().mockReturnValue(true),
}))

vi.mock('../../tmux.js', () => ({
  sendOption: vi.fn(),
  sendTextInput: vi.fn(),
  sleepMs: vi.fn(),
}))

import { sendOption, sendTextInput } from '../../tmux.js'
import { runSendAnswer } from '../../commands/send-answer.js'

const mockSendOption = vi.mocked(sendOption)
const mockSendTextInput = vi.mocked(sendTextInput)

describe('runSendAnswer', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-answer-test-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '%5\n', 'utf-8')
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('sends option number via sendOption', () => {
    runSendAnswer({ cwd: tmpDir, option: 2 })
    expect(mockSendOption).toHaveBeenCalledWith('%5', 2)
  })

  it('sends text via sendTextInput', () => {
    runSendAnswer({ cwd: tmpDir, text: 'PostgreSQL' })
    expect(mockSendTextInput).toHaveBeenCalledWith('%5', 'PostgreSQL')
  })

  it('throws if neither option nor text provided', () => {
    expect(() => runSendAnswer({ cwd: tmpDir })).toThrow(/--option or --text/)
  })

  it('throws if no runner pane ID found', () => {
    fs.writeFileSync(path.join(tmpDir, '.team-config', 'runner-pane-id.txt'), '', 'utf-8')
    expect(() => runSendAnswer({ cwd: tmpDir, option: 1 })).toThrow(/no active runner/)
  })

  it('throws if both option and text provided', () => {
    expect(() => runSendAnswer({ cwd: tmpDir, option: 1, text: 'hello' })).toThrow(/only one/)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/send-answer.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

Create `src/commands/send-answer.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import chalk from 'chalk'
import { checkPrereqs } from '../prereqs.js'
import { teamConfigExists } from '../scaffold.js'
import { sendOption, sendTextInput } from '../tmux.js'

interface SendAnswerOptions {
  cwd?: string
  option?: number
  text?: string
}

export function runSendAnswer(options: SendAnswerOptions = {}): void {
  const cwd = options.cwd ?? process.cwd()

  checkPrereqs(['tmux'])

  if (!teamConfigExists(cwd)) {
    throw new Error(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`)
  }

  if (options.option !== undefined && options.text !== undefined) {
    throw new Error('Specify only one of --option or --text, not both.')
  }

  if (options.option === undefined && options.text === undefined) {
    throw new Error('Specify --option <N> or --text "answer" to send input to the Runner.')
  }

  // Read runner pane ID
  const runnerPanePath = path.join(cwd, '.team-config', 'runner-pane-id.txt')
  let paneId: string
  try {
    paneId = fs.readFileSync(runnerPanePath, 'utf-8').trim()
  } catch {
    throw new Error('No runner-pane-id.txt found — no active runner.')
  }

  if (!paneId) {
    throw new Error('No pane ID in runner-pane-id.txt — no active runner.')
  }

  if (options.option !== undefined) {
    console.log(chalk.blue(`Selecting option ${options.option} in pane ${paneId}...`))
    sendOption(paneId, options.option)
    console.log(chalk.green('Option selected.'))
  } else if (options.text !== undefined) {
    console.log(chalk.blue(`Sending text to pane ${paneId}...`))
    sendTextInput(paneId, options.text)
    console.log(chalk.green('Text sent.'))
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/send-answer.test.ts`
Expected: PASS

**Step 5: Register command in index.ts**

Add import and command:

```typescript
import { runSendAnswer } from './commands/send-answer.js'
```

```typescript
program
  .command('send-answer')
  .description('Send input to the active Runner (option selection or free text)')
  .option('--option <n>', 'Select option number N in AskUserQuestion', parseInt)
  .option('--text <text>', 'Send free text input')
  .action((opts) => {
    try {
      runSendAnswer({ option: opts.option, text: opts.text })
    } catch (err: any) {
      console.error(err.message)
      process.exit(1)
    }
  })
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add src/commands/send-answer.ts src/__tests__/commands/send-answer.test.ts src/index.ts
git commit -m "feat: add send-answer command for reliable Runner input (IMP-4)"
```

---

### Task 8: Enhance `crewpilot watch` to write state files (IMP-2)

**Files:**
- Modify: `src/commands/watch.ts`
- Test: `src/__tests__/commands/watch.test.ts`

**Step 1: Write the failing tests**

In `src/__tests__/commands/watch.test.ts`, add:

```typescript
describe('state file writing', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewpilot-watch-state-'))
    const configDir = path.join(tmpDir, '.team-config')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'USER-CONTEXT.md'),
      '# User Context\n\n## Project Name\nTestApp\n',
      'utf-8'
    )
    fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '%5\n', 'utf-8')
    vi.clearAllMocks()
    mockTeamConfigExists.mockReturnValue(true)
    mockSessionExists.mockReturnValue(true)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes runner-state.json during watch cycle', async () => {
    mockListPanes.mockReturnValue([{ id: '%5', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('⏳ Thinking...\n❯')

    await runWatch({ cwd: tmpDir, once: true, notify: 'log' })

    const statePath = path.join(tmpDir, '.team-config', 'runner-state.json')
    expect(fs.existsSync(statePath)).toBe(true)
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.paneId).toBe('%5')
    expect(state.state).toBe('working')
    expect(state.timestamp).toBeDefined()
  })

  it('extracts question details when question state detected', async () => {
    mockListPanes.mockReturnValue([{ id: '%5', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue(
      'Which database should we use?\n❯ 1. PostgreSQL\n  2. SQLite\n  3. MongoDB\nEnter to select · Tab/Arrow keys to navigate'
    )

    await runWatch({ cwd: tmpDir, once: true, notify: 'log' })

    const statePath = path.join(tmpDir, '.team-config', 'runner-state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.state).toBe('question')
    expect(state.detectedQuestion).toBeDefined()
  })

  it('appends to runner-events.log on state transition', async () => {
    mockListPanes.mockReturnValue([{ id: '%5', active: true, command: 'claude' }])
    mockCapturePaneContent.mockReturnValue('Error: connection refused\nfailed to start\n$')

    await runWatch({ cwd: tmpDir, once: true, notify: 'log' })

    const eventsPath = path.join(tmpDir, '.team-config', 'runner-events.log')
    expect(fs.existsSync(eventsPath)).toBe(true)
    const content = fs.readFileSync(eventsPath, 'utf-8')
    expect(content).toContain('error')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/watch.test.ts`
Expected: FAIL — runner-state.json is not written

**Step 3: Implement state file writing**

In `src/commands/watch.ts`, add a function to extract question details:

```typescript
interface DetectedQuestion {
  text: string
  options: string[]
  type: 'multiple_choice' | 'free_text'
}

function extractQuestion(content: string): DetectedQuestion | null {
  const lines = content.split('\n')
  const options: string[] = []
  let questionText = ''

  for (const line of lines) {
    const optionMatch = line.match(/^[❯\s]*\d+\.\s+(.+)/)
    if (optionMatch) {
      options.push(optionMatch[1].trim())
    }
  }

  if (options.length === 0) return null

  // Find the question text (line before the first option)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^[❯\s]*\d+\.\s+/)) {
      // Look backwards for the question
      for (let j = i - 1; j >= 0; j--) {
        const line = lines[j].trim()
        if (line && !line.match(/^[←→☐✔]/) && !line.match(/^─/)) {
          questionText = line
          break
        }
      }
      break
    }
  }

  return {
    text: questionText,
    options,
    type: options.length > 0 ? 'multiple_choice' : 'free_text',
  }
}
```

Add a function to write state file:

```typescript
interface RunnerStateFile {
  paneId: string
  state: RunnerState['state']
  confidence: number
  timestamp: string
  idleSince: string | null
  capturedContent: string
  detectedQuestion: DetectedQuestion | null
  details: string | undefined
}

function writeRunnerState(cwd: string, state: RunnerState, content: string): void {
  const stateFile: RunnerStateFile = {
    paneId: state.paneId,
    state: state.state,
    confidence: state.confidence,
    timestamp: new Date().toISOString(),
    idleSince: state.idleDurationMs && state.idleDurationMs > 0
      ? new Date(Date.now() - state.idleDurationMs).toISOString()
      : null,
    capturedContent: content,
    detectedQuestion: state.state === 'question' ? extractQuestion(content) : null,
    details: state.details,
  }

  const statePath = path.join(cwd, '.team-config', 'runner-state.json')
  fs.writeFileSync(statePath, JSON.stringify(stateFile, null, 2), 'utf-8')
}

function appendRunnerEvent(cwd: string, event: string, paneId: string): void {
  const eventsPath = path.join(cwd, '.team-config', 'runner-events.log')
  const timestamp = new Date().toISOString()
  const entry = `[${timestamp}] ${paneId}: ${event}\n`
  fs.appendFileSync(eventsPath, entry, 'utf-8')
}
```

In the main watch loop (inside `for (const state of states)`), after the notification logic, add:

```typescript
// Write state file for Team Lead consumption
writeRunnerState(cwd, state, content)

// Log state transitions as events
if (changed && !isNew) {
  appendRunnerEvent(cwd, `state changed: ${prevState?.state} -> ${state.state}`, state.paneId)
}
```

Note: You need to capture `content` from within the `getRunnerStates` function. Modify that function to also return the raw captured content alongside each state. The simplest approach: add a `rawContent` field to `RunnerState`.

Add `rawContent: string` to the `RunnerState` interface, populate it in `getRunnerStates`, and use it in the watch loop.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/watch.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/commands/watch.ts src/__tests__/commands/watch.test.ts
git commit -m "feat: enhance watch to write runner-state.json and event log (IMP-2)"
```

---

### Task 9: Update `crewpilot init` for branch detection + project-config.json (BUG-3)

**Files:**
- Modify: `src/commands/init.ts`
- Modify: `src/scaffold.ts`
- Test: `src/__tests__/commands/init.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/commands/init.test.ts`, add a test:

```typescript
it('writes project-config.json with default branch', async () => {
  const { execFileSync } = await import('node:child_process')
  vi.mocked(execFileSync).mockReturnValueOnce(Buffer.from('main\n'))

  // ... run init with appropriate options ...
  await runInit({ cwd: tmpDir, name: 'Test', description: 'Test', user: 'devs', tech: 'Node', workflow: 'gsd' })

  const configPath = path.join(tmpDir, '.team-config', 'project-config.json')
  expect(fs.existsSync(configPath)).toBe(true)
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  expect(config.defaultBranch).toBeDefined()
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/init.test.ts`
Expected: FAIL

**Step 3: Implement**

In `src/scaffold.ts`, update `scaffoldTeamConfig` to accept an optional `defaultBranch` parameter and write `project-config.json`:

```typescript
// Add to ScaffoldInput interface:
defaultBranch?: string
```

In the `scaffoldTeamConfig` function, after writing the other files, add:

```typescript
// Write project-config.json
const projectConfig = {
  defaultBranch: input.defaultBranch ?? 'master',
  createdAt: new Date().toISOString(),
}
fs.writeFileSync(
  path.join(configDir, 'project-config.json'),
  JSON.stringify(projectConfig, null, 2),
  'utf-8'
)
```

In `src/commands/init.ts`, after getting the workflow and before calling `scaffoldTeamConfig`, add:

```typescript
import { getDefaultBranch } from '../utils.js'

// After workflow selection:
const defaultBranch = getDefaultBranch(cwd)
```

Pass `defaultBranch` into `scaffoldTeamConfig`:

```typescript
scaffoldTeamConfig(cwd, {
  projectName,
  description,
  userDescription,
  techStack,
  workflow,
  defaultBranch,
})
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/init.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/commands/init.ts src/scaffold.ts src/__tests__/commands/init.test.ts
git commit -m "feat: detect default branch and write project-config.json during init (BUG-3)"
```

---

### Task 10: Update `start.ts` to write Team Lead lockfile (IMP-1)

**Files:**
- Modify: `src/commands/start.ts`
- Test: `src/__tests__/commands/start.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/commands/start.test.ts`, add:

```typescript
it('writes team-lead lockfile after creating session', async () => {
  const configDir = path.join(tmpDir, '.team-config')
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(
    path.join(configDir, 'USER-CONTEXT.md'),
    '# User Context\n\n## Project Name\nTestApp\n',
    'utf-8'
  )

  await runStart({ cwd: tmpDir, noAttach: true })

  const lockPath = path.join(tmpDir, '.team-config', '.team-lead-lock')
  expect(fs.existsSync(lockPath)).toBe(true)
  const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'))
  expect(lockData.paneId).toBeDefined()
  expect(lockData.startedAt).toBeDefined()
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/start.test.ts`
Expected: FAIL

**Step 3: Implement**

In `src/commands/start.ts`, import `writeLockfile`:

```typescript
import { getProjectName, getSessionName, writeLockfile } from '../utils.js'
```

After `createSession(sessionName, cwd)` succeeds, add:

```typescript
// Write Team Lead lockfile for singleton check
writeLockfile(cwd, '.team-lead-lock', `${sessionName}:0`)
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/start.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/start.ts src/__tests__/commands/start.test.ts
git commit -m "feat: write Team Lead lockfile during start (IMP-1)"
```

---

### Task 11: Update `stop.ts` to clean up lockfiles (IMP-1)

**Files:**
- Modify: `src/commands/stop.ts`
- Test: `src/__tests__/commands/stop.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/commands/stop.test.ts`, add:

```typescript
it('removes team-lead and runner lockfiles on stop', () => {
  // Setup
  const configDir = path.join(tmpDir, '.team-config')
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, 'USER-CONTEXT.md'), '# User Context\n\n## Project Name\nTestApp\n')
  fs.writeFileSync(path.join(configDir, 'runner-pane-id.txt'), '')
  fs.writeFileSync(path.join(configDir, '.team-lead-lock'), '{"paneId":"%0"}')
  fs.writeFileSync(path.join(configDir, '.runner-lock'), '{"paneId":"%5"}')

  mockSessionExists.mockReturnValue(true)
  mockListPanes.mockReturnValue([])

  runStop(tmpDir)

  expect(fs.existsSync(path.join(configDir, '.team-lead-lock'))).toBe(false)
  expect(fs.existsSync(path.join(configDir, '.runner-lock'))).toBe(false)
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/commands/stop.test.ts`
Expected: FAIL

**Step 3: Implement**

In `src/commands/stop.ts`, import `removeLockfile`:

```typescript
import { getProjectName, getSessionName, removeLockfile } from '../utils.js'
```

Before the final success message, add:

```typescript
// Clean up lockfiles
removeLockfile(dir, '.team-lead-lock')
removeLockfile(dir, '.runner-lock')
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/commands/stop.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/commands/stop.ts src/__tests__/commands/stop.test.ts
git commit -m "feat: clean up lockfiles during stop (IMP-1)"
```

---

### Task 12: Update Team Lead persona template (IMP-1, IMP-3, IMP-5, IMP-6, IMP-7, IMP-8)

**Files:**
- Modify: `src/templates.ts`
- Test: `src/__tests__/templates.test.ts`

**Step 1: Write the failing test**

In `src/__tests__/templates.test.ts`, add:

```typescript
describe('teamLeadPersonaTemplate', () => {
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/templates.test.ts`
Expected: FAIL — persona doesn't contain the new sections

**Step 3: Update the persona template**

In `src/templates.ts`, update the `teamLeadPersonaTemplate` function. Key changes:

1. **Add Singleton Check** to the startup workflow (after step 1):
```
### Singleton Check
Before proceeding, read \`.team-config/.team-lead-lock\`. If it exists and the pane listed
in it is still alive (verify with \`tmux list-panes\`), another Team Lead session is active.
Exit immediately with: "Another Team Lead is active in pane {paneId}. Exiting."
If the lockfile is stale (>24 hours old or pane is dead), proceed normally.
```

2. **Replace raw tmux Runner launch** section with CLI commands:
```
### Launching a Runner

Use the CLI command instead of raw tmux:

\`\`\`bash
crewpilot launch-runner --workflow gsd
# or
crewpilot launch-runner --workflow superpowers --prompt "Build [description]"
# or
crewpilot launch-runner --prompt "Resume from task N. Read docs/plans/<plan>.md"
\`\`\`

### Stopping a Runner

\`\`\`bash
crewpilot stop-runner
# or force:
crewpilot stop-runner --force
\`\`\`

### Sending Input to Runners

\`\`\`bash
# Select option N in AskUserQuestion:
crewpilot send-answer --option N

# Send free text:
crewpilot send-answer --text "Your answer"
\`\`\`
```

3. **Simplify polling loop** to read `runner-state.json`:
```
### Simplified Polling Loop

1. Read \`.team-config/runner-state.json\`
2. If state is "question": read detectedQuestion, formulate answer, run \`crewpilot send-answer\`
3. If state is "working": do nothing
4. If state is "error": assess severity and intervene
5. If state is "idle" for >30s: check if work is complete
6. Sleep 5 seconds, repeat

NOTE: \`crewpilot watch\` must be running in another pane/terminal for runner-state.json to update.
Start it with: \`crewpilot watch\` (in a separate terminal, not inside the tmux session).
```

4. **Add Context Exhaustion Protocol** section:
```
### Runner Context Exhaustion Protocol

When runner-state.json shows signs of high context (look for context warnings in capturedContent):
1. Wait for the current task to complete
2. Run \`crewpilot stop-runner\`
3. Save the current task number/phase to state-snapshot.md
4. Run \`crewpilot launch-runner --prompt "Resume from task N. Read docs/plans/<plan>.md for context."\`
5. Resume monitoring
```

5. **Add Post-Execution Verification** section:
```
## Post-Execution Verification

After Runner execution completes:
1. Run the project's test suite (detect test command from package.json scripts)
2. Read the design doc and compare delivered features against requirements
3. Write an evaluation report to \`.team-config/evaluations/YYYY-MM-DD-<phase>.md\`
4. If issues found: launch a fix Runner or escalate to human via needs-human-decision.md
```

6. **Update communication log format** (IMP-6):
```
## [YYYY-MM-DD HH:MM:SS] [TL-{paneId}] | {workflow} {phase}
Q: "{question text}"
A: (User Proxy) "{your answer}"
Basis: {which file/knowledge informed your decision}
```

7. **Add batch task tracker note** (IMP-7):
Add to the Superpowers Runner Operations section:
```
**Batch Task Tracking:** When you observe the Runner batching multiple tasks into a single
subagent dispatch, after the batch completes, verify all individual task trackers are
updated to completed. If they show as open, update them manually.
```

8. **Merge session-recovery into state-snapshot** (IMP-8):
Replace the `session-recovery.md` references. The recovery instructions now live as a fixed section in the persona. The volatile state is only in `state-snapshot.md`.

9. **Add `runner-state.json` and `project-config.json`** to the File Reference table.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/templates.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/templates.ts src/__tests__/templates.test.ts
git commit -m "feat: update Team Lead persona with CLI commands, singleton check, verification, context exhaustion protocol (IMP-1,3,5,6,7,8)"
```

---

### Task 13: Bump version to 0.2.0 and run final tests

**Files:**
- Modify: `package.json`

**Step 1: Update version**

In `package.json`, change:
```json
"version": "0.2.0"
```

**Step 2: Build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 4: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 5: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 0.2.0"
```

---

## Summary

| Task | What | Fixes |
|------|------|-------|
| 1 | `createWindow` in tmux.ts | BUG-1 foundation |
| 2 | `sendOption` in tmux.ts | IMP-4 foundation |
| 3 | `getDefaultBranch` in utils.ts | BUG-3 |
| 4 | Lockfile helpers in utils.ts | IMP-1 foundation |
| 5 | `launch-runner` command | BUG-1, IMP-4 |
| 6 | `stop-runner` command | BUG-1 complement |
| 7 | `send-answer` command | IMP-4 |
| 8 | Enhanced `watch` with state files | IMP-2 |
| 9 | `init` branch detection + config | BUG-3 |
| 10 | `start` lockfile write | IMP-1 |
| 11 | `stop` lockfile cleanup | IMP-1 |
| 12 | Persona template update | IMP-1,3,5,6,7,8 |
| 13 | Version bump + final tests | Release prep |

**BUG-2** (security hook false positives) is documented in the design doc as a user-environment fix, not a code change. Consider adding a TROUBLESHOOTING.md section as a follow-up.
