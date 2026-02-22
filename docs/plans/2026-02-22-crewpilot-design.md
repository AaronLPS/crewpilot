# Crewpilot CLI Design Document

> Date: 2026-02-22
> Status: Approved
> Reference: crewpilot-project-brief.md, agent-team-architecture-v2.md

## Overview

Crewpilot is a Node.js/TypeScript CLI that scaffolds `.team-config/` files and manages tmux sessions for an AI agent team framework built on Claude Code. It sets up a Team Lead (acting as User Proxy) that autonomously drives GSD/Superpowers workflows through tmux, replacing the human in interactive questioning phases.

Crewpilot contains no AI logic, no polling loops, no decision-making. All intelligence lives in the Claude Code Team Lead agent, driven by the `team-lead-persona.md` template.

## Tech Stack

- **Language:** TypeScript (ESM)
- **Build:** tsup (single bundled output)
- **CLI framework:** commander
- **Interactive prompts:** @inquirer/prompts
- **Terminal styling:** chalk
- **tmux interaction:** child_process.execFileSync (safe, no shell injection)
- **Node.js:** >= 18
- **Install:** `npm install -g crewpilot`

No other runtime dependencies.

## Project Structure

```
crewpilot/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.ts              # CLI entry, Commander program definition
│   ├── commands/
│   │   ├── init.ts
│   │   ├── start.ts
│   │   ├── resume.ts
│   │   ├── status.ts
│   │   ├── feedback.ts
│   │   └── stop.ts
│   ├── tmux.ts               # tmux execFileSync wrappers
│   ├── templates.ts          # All template content generators
│   ├── scaffold.ts           # .team-config/ directory creation
│   ├── prereqs.ts            # Check tmux, claude availability
│   └── utils.ts              # Chalk helpers, path utils
├── docs/
│   └── plans/
│       └── 2026-02-22-crewpilot-design.md
├── crewpilot-project-brief.md
└── agent-team-architecture-v2.md
```

Flat module architecture: one file per command, shared tmux/template/scaffold modules. Right-sized for a focused CLI with 6 commands.

## Commands

### `crewpilot init`

Interactive scaffolding for a new project.

**Behavior:**
1. Check prerequisites (claude in PATH only if `--existing`)
2. Check if `.team-config/` already exists — ask to overwrite or abort
3. Run interactive prompts:
   - Project name (text, default: directory name)
   - Project description (text)
   - Target user description (text: "Who is this for?")
   - Tech stack / constraints (text)
   - Preferred workflow (select: GSD / Superpowers / Decide later)
4. Create `.team-config/` directory and all files
5. Create/append to `CLAUDE.md`
6. If `--existing`: shell out to `claude --print` to generate `project-context.md`

**Flags:**
- `--existing` — Trigger codebase scan via Claude Code
- `--workflow gsd|superpowers` — Skip workflow prompt
- `--name "Name"` — Skip project name prompt

**Files created in `.team-config/`:**

| File | Content |
|------|---------|
| `team-lead-persona.md` | Full behavioral spec (translated from arch doc) |
| `target-user-profile.md` | Template pre-filled with user's input |
| `USER-CONTEXT.md` | Pre-filled from project description + constraints |
| `project-context.md` | Empty template (or auto-generated with `--existing`) |
| `session-recovery.md` | Empty template with structure |
| `state-snapshot.md` | Empty |
| `communication-log.md` | Empty with header |
| `human-inbox.md` | Empty with usage instructions |
| `human-directives.md` | Empty |
| `needs-human-decision.md` | Empty |
| `runner-pane-id.txt` | Empty |
| `user-research/` | Empty directory |
| `evaluations/` | Empty directory |
| `archives/` | Empty directory |

**CLAUDE.md append:**
```markdown
## Crewpilot Team Configuration

You are the Team Lead in a Crewpilot agent team framework.
Read `.team-config/team-lead-persona.md` for your complete behavioral specification.
Read `.team-config/target-user-profile.md` for the target user profile.
Read `.team-config/USER-CONTEXT.md` for project context and user requirements.

You MUST follow the Team Lead persona instructions precisely.
```

**`--existing` codebase scan:**
Uses `claude --print -p "Analyze this codebase..."` — captures stdout via execFileSync and writes to `project-context.md`.

### `crewpilot start`

Launches the full framework.

**Behavior:**
1. Check prerequisites (tmux + claude)
2. Verify `.team-config/` exists — error if not
3. Read project name
4. Check for existing tmux session — offer to attach or recreate
5. Create tmux session: `tmux new-session -d -s "crewpilot-{name}" -c "{dir}"`
6. Launch Claude Code via tmux send-keys
7. Wait ~3-5 seconds for Claude Code to be ready
8. Inject bootstrap prompt (concise — tells Team Lead to read persona files)
9. Double Enter for multi-line submit
10. Print human instructions
11. Attach or stay detached

**Bootstrap prompt:**
```
Read .team-config/team-lead-persona.md, then .team-config/target-user-profile.md, then .team-config/USER-CONTEXT.md. You are the Team Lead. Begin the startup workflow as described in your persona.
```

**Flags:**
- `--attach` (default: true) — Attach to tmux after creation
- `--no-attach` — Background mode

### `crewpilot resume`

Resumes an interrupted project.

**Behavior:**
1. Check prerequisites (tmux + claude)
2. Verify `.team-config/` exists
3. Check for existing tmux session:
   - Session exists with live panes -> attach to it
   - Session doesn't exist -> create new session
4. When launching new session, depends on mode:
   - `--continue` (default): `claude --continue --dangerously-skip-permissions`, then inject recovery prompt
   - `--fresh`: `claude --dangerously-skip-permissions`, then inject full recovery prompt

**Recovery prompt:**
```
Read .team-config/session-recovery.md and follow the recovery instructions.
Read .team-config/team-lead-persona.md to restore your Team Lead persona.
Resume work from where you left off.
```

**Flags:**
- `--continue` (default) — Resume last Claude Code conversation
- `--fresh` — Start new conversation with recovery prompt
- `--attach` / `--no-attach`

### `crewpilot status`

Quick status check without entering the tmux session.

**Reads and displays:**
1. `.team-config/state-snapshot.md` — Last known state
2. `.planning/STATE.md` — GSD progress (if exists)
3. `.team-config/needs-human-decision.md` — Pending decisions
4. tmux session info via `tmux list-panes` (if session exists)

**Output:** Color-coded sections using chalk.

### `crewpilot feedback "message"`

Async feedback without entering tmux.

**Behavior:**
1. Verify `.team-config/` exists
2. Append timestamped message to `.team-config/human-inbox.md`
3. Print confirmation

### `crewpilot stop`

Gracefully stops the framework.

**Behavior:**
1. Find tmux session and Runner panes
2. Send `/exit` to each Runner pane (with double Enter)
3. Wait 5 seconds for graceful shutdown
4. Send `/exit` to Team Lead pane
5. Wait 3 seconds
6. Kill tmux session
7. Print confirmation — state preserved in `.team-config/`

## tmux Module (`tmux.ts`)

Synchronous wrappers around `child_process.execFileSync` (no shell, safe from injection):

```typescript
// Session operations
createSession(name: string, cwd: string): void
killSession(name: string): void
sessionExists(name: string): boolean
listPanes(session: string): PaneInfo[]
attachSession(name: string): void

// Pane operations
sendKeys(paneId: string, keys: string): void
sendEnter(paneId: string): void
capturePaneContent(paneId: string, lines?: number): string
splitWindowHorizontal(session: string): string

// Convenience (used by CLI, not Team Lead agent)
sendTextInput(paneId: string, text: string): void   // handles double-Enter
selectOption(paneId: string, optionIndex: number): void  // handles Down+delay
```

All tmux commands use `execFileSync('tmux', [...args])` to avoid shell injection.

## Prerequisite Checks (`prereqs.ts`)

```typescript
checkPrereqs(requirements: ('tmux' | 'claude')[]): void
```

Called at the top of every command with appropriate requirements:
- `init`: `claude` only if `--existing`
- `start`, `resume`, `stop`: `tmux` + `claude`
- `status`: `tmux` (degrades gracefully)
- `feedback`: none

Throws with clear install instructions if missing.

## Team Lead Persona Template

The `team-lead-persona.md` is a comprehensive English translation of the architecture doc (sections II-IX), written as direct imperative instructions. Structure:

1. **Identity** — Who you are
2. **Three Roles** — User Proxy, tmux Manager, Review & Evaluate
3. **tmux Command Reference** — Exact syntax for capture-pane, send-keys, split-window
4. **Runner State Detection** — Spinner, AskUserQuestion UI, idle prompt, GSD markers
5. **Polling Loop** — 5-8 second cycle with all steps
6. **How to Answer Questions** — Read question, consult profiles, send answer, log
7. **Context Management** — /clear thresholds, snapshot timing, recovery procedure
8. **Session Recovery** — Read files, check panes, resume or restart
9. **File Reference** — All .team-config/ files with read/write rules
10. **Human Interaction Protocol** — Direct pane input, async inbox, escalation

Estimated ~2000-3000 words of precise, actionable instructions with exact tmux command syntax and UI detection patterns.

## Other Templates

- **target-user-profile.md**: Structured profile template pre-filled from init prompts
- **USER-CONTEXT.md**: Project description, tech stack, constraints from init prompts
- **project-context.md**: Empty template (or Claude-generated with `--existing`)
- **session-recovery.md**: Recovery instruction template with placeholders
- **communication-log.md**: Header with format example
- **human-inbox.md**: Header with usage instructions

## Key Design Decisions

1. **Flat module architecture** — One file per command, no over-abstraction
2. **Persona-driven intelligence** — All behavior lives in the template, CLI is pure orchestration
3. **Concise bootstrap prompt** — Tells Team Lead to read files, not inline instructions
4. **CLAUDE.md integration** — Ensures Team Lead picks up directives immediately
5. **Claude --print for codebase scan** — Keeps CLI LLM-free while leveraging Claude for analysis
6. **Resume modes** — User chooses --continue (context preserved) or --fresh (file-based recovery)
7. **Synchronous tmux operations** — execFileSync with argument arrays (safe, no shell injection)
8. **Prerequisite checks per command** — Clear error messages with install instructions

## Build Order

1. Project scaffolding (package.json, tsconfig, tsup)
2. `prereqs.ts` and `utils.ts`
3. `tmux.ts`
4. `templates.ts` (team-lead-persona.md is the largest piece)
5. `scaffold.ts`
6. Commands: init -> start -> resume -> status -> feedback -> stop
7. `index.ts` (Commander wiring)
8. Build, test, verify global install
