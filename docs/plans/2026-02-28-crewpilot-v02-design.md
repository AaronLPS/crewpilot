# Crewpilot v0.2 Design: CLI-First Architecture

**Date:** 2026-02-28
**Status:** Approved
**Approach:** CLI-First (move tmux operations into CLI commands, simplify Team Lead persona)
**Source:** Session feedback from Kanban Board test project

---

## Problem Statement

Crewpilot v0.1 was tested end-to-end building a full-stack Kanban app. The test revealed 3 bugs and 8 improvement areas. The core issue: the Team Lead AI spends too much effort fighting tmux mechanics instead of making decisions. v0.2 moves operational complexity into CLI commands so the Team Lead can focus on its strengths.

## Scope

All 3 bugs (BUG-1, BUG-2, BUG-3) and all 8 improvements (IMP-1 through IMP-8).

---

## Section 1: `crewpilot launch-runner` Command

**Fixes:** BUG-1 (tmux pane disappearing), IMP-4 (double-Enter errors)

### Interface

```
crewpilot launch-runner [--workflow <gsd|superpowers>] [--prompt <text>]
```

### Behavior

1. Reads `runner-pane-id.txt` -- if a runner pane already exists and is alive, rejects with error
2. Creates a new tmux window with `-d` flag (detached) in the existing crewpilot session
3. Navigates to project directory
4. Launches `claude --dangerously-skip-permissions`
5. Waits for Claude to initialize (4s delay)
6. Sends the appropriate workflow command based on `--workflow` flag, or the raw `--prompt` text
7. Handles the double-Enter submission pattern internally
8. Writes the new pane ID to `runner-pane-id.txt`
9. Writes a lockfile `.team-config/.runner-lock` with timestamp + pane ID
10. Outputs the pane ID to stdout

### Key Decisions

- Uses `tmux new-window -d` instead of `split-window` to avoid the disappearing pane bug
- All send-keys + sleep + Enter sequences are chained in a single atomic operation
- The `sendTextInput` helper wraps the double-Enter pattern

### New `tmux.ts` Functions

- `createWindow(session, detached)` -- creates a new window, returns pane ID
- `sendWorkflowCommand(paneId, command)` -- sends command + double-Enter with proper delays

### Complementary: `crewpilot stop-runner`

```
crewpilot stop-runner [--force]
```

Gracefully stops the runner (sends `/exit` + Enter), with `--force` falling back to `tmux kill-pane`. Cleans up `runner-pane-id.txt` and `.runner-lock`.

---

## Section 2: Enhanced `crewpilot watch` as Polling Daemon

**Fixes:** IMP-2 (polling loop never runs as a loop)

### Enhanced Behavior

The existing `crewpilot watch` command already detects runner states. We extend it to write structured state files that the Team Lead reads instead of doing its own tmux capture-pane.

#### State File: `.team-config/runner-state.json`

On every poll cycle, write:

```json
{
  "paneId": "%14",
  "state": "question",
  "confidence": 0.95,
  "timestamp": "2026-02-28T10:30:00Z",
  "idleSince": null,
  "capturedContent": "last 50 lines...",
  "detectedQuestion": {
    "text": "Which database should we use?",
    "options": ["PostgreSQL", "SQLite", "MongoDB"],
    "type": "multiple_choice"
  }
}
```

#### Question Extraction

When a `question` state is detected, parse the AskUserQuestion UI to extract question text and options. Write them to `runner-state.json` so the Team Lead reads the question without capture-pane.

#### Completion Detection

When runner transitions from `working` to `idle` for >30 seconds, write a `phase_complete` event to `.team-config/runner-events.log` (append-only).

#### Error Extraction

When `error` state detected, extract error text and include in `runner-state.json`.

### New Command: `crewpilot send-answer`

```
crewpilot send-answer --option <N>      # Select option N in AskUserQuestion
crewpilot send-answer --text "answer"   # Send free text input
```

Wraps tmux send-keys + double-Enter pattern. The Team Lead never manages raw tmux input.

### Simplified Team Lead Polling

The persona polling loop becomes:

```
1. Read .team-config/runner-state.json
2. If state is "question": answer via `crewpilot send-answer`
3. If state is "working": do nothing
4. If state is "error": assess and intervene
5. Sleep 5 seconds, repeat
```

---

## Section 3: Team Lead Singleton Check

**Fixes:** IMP-1 (accidental multi-Team-Lead)

### Mechanism

1. During `crewpilot start`, write lockfile `.team-config/.team-lead-lock`:
   ```json
   {"paneId": "%0", "pid": 12345, "startedAt": "2026-02-28T10:00:00Z"}
   ```

2. Team Lead persona startup workflow step 1: read `.team-config/.team-lead-lock`. If it exists and the pane ID is alive (verify with `tmux list-panes`), another Team Lead is active -- exit with warning.

3. `crewpilot stop` cleans up the lockfile.

4. Stale detection: if lockfile timestamp >24 hours old or pane ID doesn't exist, treat as stale and overwrite.

---

## Section 4: Default Branch Detection

**Fixes:** BUG-3 (stale main vs master assumption)

### Mechanism

1. During `crewpilot init`, detect the default branch:
   ```typescript
   const defaultBranch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD']).toString().trim()
   // fallback: try 'git config init.defaultBranch', then 'master'
   ```

2. Write to `.team-config/project-config.json`:
   ```json
   {"defaultBranch": "master"}
   ```

3. Team Lead persona references this file when needing branch name.

---

## Section 5: Security Hook Documentation

**Fixes:** BUG-2 (security hook false positives on markdown files)

This is a user-environment fix, not a crewpilot code change. The security hook scans `.md` files for bash commands in fenced code blocks and triggers false positives.

### Recommended Fix (documented in troubleshooting)

Add path-based exclusions to the security hook for:
- `*.md` files
- Files in `.team-config/`
- Files in `docs/plans/`

### Crewpilot Action

Add a troubleshooting section to the README or a new `TROUBLESHOOTING.md` documenting this issue and the fix.

---

## Section 6: Persona Improvements

### 6a: Context Exhaustion Protocol (IMP-3)

Add to persona under "Context Management":

```markdown
### Runner Context Exhaustion Protocol

When you detect the Runner has exceeded 80% context (look for context warnings
in capture-pane output or in runner-state.json):
1. Wait for the current task to complete
2. Run `crewpilot stop-runner`
3. Save the current task number/phase to state-snapshot.md
4. Run `crewpilot launch-runner --prompt "Resume from task N. Read docs/plans/<plan>.md for context."`
5. Resume monitoring
```

### 6b: Post-Execution Verification Protocol (IMP-5)

Add new section to persona:

```markdown
## Post-Execution Verification

After Runner execution completes:
1. Run the project's test suite (detect test command from package.json or project files)
2. Read the design doc and compare delivered features against requirements
3. Write an evaluation report to .team-config/evaluations/YYYY-MM-DD-<phase>.md
4. If issues found, decide: launch a fix Runner or escalate to human
```

### 6c: Communication Log Fix (IMP-6)

Change logging format to append-only with Team Lead instance ID:

```markdown
## [2026-02-28 10:30:00] [TL-pane0] | Brainstorming Q3
Q: "Which database?"
A: (User Proxy) "SQLite"
Basis: USER-CONTEXT.md tech stack constraint
```

The Team Lead reads its pane ID on startup and uses it as the instance identifier.

### 6d: Task Tracker Batch Update (IMP-7)

Add to persona: "When batching multiple tasks into a single subagent dispatch, after the batch completes, update ALL individual task trackers to completed."

### 6e: Session Recovery Sync (IMP-8)

Remove `session-recovery.md` as a separate volatile file. Instead:
- Recovery instructions become a fixed section in the persona (they don't change per session)
- Volatile state lives in `state-snapshot.md` (already updated regularly)
- The scaffold still creates the file for backwards compatibility, but the persona no longer treats it as a separate state store

---

## Updated Command Summary

After v0.2, the CLI commands are:

| Command | Status | Purpose |
|---------|--------|---------|
| `crewpilot init` | Updated | + branch detection, + project-config.json |
| `crewpilot start` | Updated | + lockfile write |
| `crewpilot launch-runner` | **New** | Atomic runner pane creation |
| `crewpilot stop-runner` | **New** | Graceful runner shutdown |
| `crewpilot send-answer` | **New** | Send input to runner |
| `crewpilot watch` | Updated | + state file writing, + question extraction |
| `crewpilot stop` | Updated | + lockfile cleanup |
| `crewpilot status` | Unchanged | |
| `crewpilot resume` | Unchanged | |
| `crewpilot feedback` | Unchanged | |
| `crewpilot search` | Unchanged | |
| `crewpilot check` | Unchanged | |
| `crewpilot dashboard` | Unchanged | |
| `crewpilot monitor` | Unchanged | |
| `crewpilot export` | Unchanged | |

## Updated File Structure

New files in `.team-config/`:

| File | Purpose |
|------|---------|
| `.team-lead-lock` | Singleton lock (dotfile, not committed) |
| `.runner-lock` | Runner existence lock (dotfile) |
| `runner-state.json` | Current runner state (written by watch) |
| `runner-events.log` | Append-only event log |
| `project-config.json` | Project metadata (default branch, etc.) |

## Testing Strategy

- Unit tests for all new CLI commands (launch-runner, stop-runner, send-answer)
- Unit tests for enhanced watch (state file writing, question extraction)
- Unit tests for branch detection logic
- Unit tests for lockfile management
- Integration considerations: mock tmux operations as done in existing tests
