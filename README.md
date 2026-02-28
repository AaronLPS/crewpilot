# Crewpilot

[![npm version](https://img.shields.io/npm/v/crewpilot.svg)](https://www.npmjs.com/package/crewpilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/AaronLPS/crewpilot/blob/master/LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

**Autonomous AI agent teams on top of Claude Code.**

Crewpilot is a CLI tool that bootstraps and manages an AI Agent Team framework using [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and tmux. It sets up a Team Lead agent that acts as a User Proxy — autonomously driving development workflows, answering questions on behalf of your target user, and managing Runner sessions through tmux.

You describe your project and target user. Crewpilot handles the rest.

## How It Works

```
You (strategic direction)
 │
 ▼
┌─────────────────────────────────────────────────┐
│  tmux session: crewpilot-{project}              │
│                                                 │
│  Pane 0: Team Lead (Claude Code)                │
│  ├── User Proxy: answers questions as your user │
│  ├── tmux Manager: launches & monitors Runners  │
│  └── Reviewer: evaluates deliverables           │
│          │                                      │
│          ▼                                      │
│  Pane 1+: Runner (Claude Code)                  │
│  └── GSD or Superpowers workflow                │
│      └── Internal sub-agents (planning,         │
│          research, coding, testing, review)      │
└─────────────────────────────────────────────────┘
```

The Team Lead polls Runner sessions via `tmux capture-pane`, detects interactive questions, and answers them from the target user's perspective — all without requiring your input. State is persisted to files so sessions survive crashes and context resets.

## Key Features

- **Autonomous execution** — The Team Lead drives entire development workflows hands-free
- **User Proxy** — Researches and represents your target user to make user-level decisions during development
- **Two workflow engines** — [GSD](https://github.com/cyanheads/claude-code-gsd) (spec-driven, phased) or Superpowers (TDD, feature-driven)
- **Crash resilient** — All state persisted to `.team-config/` files; resume anytime
- **Async feedback** — Send direction changes without entering the tmux session
- **No AI calls in the CLI** — All intelligence lives in Claude Code sessions; the CLI is pure orchestration

## Prerequisites

- **Node.js** >= 18
- **tmux** — Crewpilot uses tmux to run the Team Lead and Runners as separate terminal panes. You don't need to know tmux — Crewpilot manages sessions for you.
  ```bash
  # macOS
  brew install tmux

  # Ubuntu / Debian
  sudo apt install tmux

  # Fedora
  sudo dnf install tmux
  ```
- **Claude Code** installed (`npm install -g @anthropic-ai/claude-code`)
- An Anthropic API key configured for Claude Code

## Installation

> **Note:** The npm package is not yet published. For now, install from source.

```bash
git clone https://github.com/AaronLPS/crewpilot.git
cd crewpilot
npm install
npm run build
npm link
```

## Quick Start

```bash
# 1. Initialize a new project
crewpilot init

# 2. Launch the framework
crewpilot start

# 3. Watch it work — or send async feedback
crewpilot feedback "Add dark mode support"

# 4. Check progress without entering tmux
crewpilot status

# 5. Resume after a break
crewpilot resume

# 6. Stop gracefully
crewpilot stop
```

## Using Crewpilot With Existing Projects

### First time — project not yet initialized

If your project doesn't have a `.team-config/` directory yet:

```bash
cd /path/to/your/project
crewpilot init --existing
crewpilot start
```

The `--existing` flag scans your codebase and writes an architecture summary to `.team-config/project-context.md`. Your existing `CLAUDE.md` is appended to, not overwritten.

### Coming back — project already initialized

If you've used Crewpilot before (`.team-config/` already exists), skip `init` entirely.

**Add a new feature:**

```bash
cd /path/to/your/project

# Option A: describe the feature upfront
crewpilot feedback "Add user authentication with OAuth2 and Google sign-in"
crewpilot start

# Option B: start first, describe interactively
crewpilot start
# then describe your feature in the tmux session
```

**Resume interrupted work:**

```bash
crewpilot resume              # reattach to existing session or restore state
crewpilot resume --fresh      # new conversation, reads saved state files
```

**Check where things stand before deciding:**

```bash
crewpilot status              # shows last state, progress, pending decisions
```

### Existing GSD project

If your project has `.planning/STATE.md` from a previous GSD session, the Team Lead detects it at startup, summarizes progress, and asks what to do:

| What you want | What happens |
|---|---|
| Continue where you left off | Team Lead uses `/gsd:resume-work` |
| Add a new feature as a new milestone | Team Lead uses `/gsd:new-milestone` |
| Squeeze in urgent work before the next phase | Team Lead uses `/gsd:insert-phase` |
| Review the roadmap and reprioritize | Team Lead uses `/gsd:progress` |
| Scrap everything and start over | Team Lead uses `/gsd:new-project` |
| Switch to Superpowers (TDD-focused) | Team Lead uses `/superpowers:brainstorming` |

### Updating requirements mid-session

You can steer the Team Lead at any time without entering tmux:

```bash
crewpilot feedback "use PostgreSQL instead of SQLite"
crewpilot feedback "skip the admin panel for now, focus on the API"
```

Or edit `.team-config/human-inbox.md` directly — the Team Lead checks it every polling cycle.

## Commands

### `crewpilot init`

Interactive project setup. Creates the `.team-config/` directory with all configuration files.

```bash
crewpilot init
crewpilot init --name "MyApp" --workflow gsd
crewpilot init --existing  # scan current codebase for project-context.md
```

**Options:**
| Flag | Description |
|------|-------------|
| `--name <name>` | Project name (skip prompt) |
| `--description <desc>` | Project description (skip prompt) |
| `--user <description>` | Target user description (skip prompt) |
| `--tech <stack>` | Tech stack / constraints (skip prompt) |
| `--workflow <type>` | `gsd` or `superpowers` (skip prompt) |
| `--existing` | Scan codebase to auto-fill project context |

### `crewpilot start`

Launches a tmux session and starts the Team Lead.

```bash
crewpilot start
crewpilot start --no-attach  # run in background
```

### `crewpilot resume`

Resumes an interrupted session with full state recovery.

```bash
crewpilot resume
crewpilot resume --fresh      # new conversation, same state files
crewpilot resume --no-attach  # resume in background
```

### `crewpilot status`

Displays current project status from `.team-config/` state files.

### `crewpilot feedback "<message>"`

Sends async feedback to the Team Lead without entering tmux.

```bash
crewpilot feedback "Prioritize mobile responsiveness"
```

### `crewpilot stop`

Gracefully shuts down all Runners and the Team Lead, preserving state.

## Workflows

### GSD (Get Stuff Done)

Best for **complex projects** that need deep planning, research, and phased execution.

The Runner goes through: Requirements gathering → Research → Roadmap → Phase planning → Execution → Verification.

```bash
crewpilot init --workflow gsd
```

### Superpowers

Best for **feature-driven work** with TDD and iterative review.

The Runner goes through: Brainstorming (Socratic dialogue) → Planning (micro-tasks) → Execution (TDD + two-stage code review per task).

```bash
crewpilot init --workflow superpowers
```

## Project Structure

```
.team-config/               # Created by crewpilot init (gitignored)
├── team-lead-persona.md    # Team Lead behavioral specification
├── target-user-profile.md  # Target user profile (evolves with research)
├── USER-CONTEXT.md         # Project requirements and constraints
├── project-context.md      # Technical context
├── state-snapshot.md       # Current state (crash recovery)
├── session-recovery.md     # Recovery instructions
├── communication-log.md    # Q&A log between Team Lead and Runners
├── human-inbox.md          # Your async messages to Team Lead
├── needs-human-decision.md # Questions requiring your judgment
├── evaluations/            # Team Lead's deliverable evaluations
└── archives/               # Historical summaries
```

## Architecture

Crewpilot uses a **pure tmux + file system architecture** — no custom agent protocol or message passing. The Team Lead is a standard Claude Code session that:

1. **Monitors** Runners by reading their terminal output (`tmux capture-pane`)
2. **Responds** to interactive questions by typing answers (`tmux send-keys`)
3. **Persists** all state to files for crash resilience
4. **Manages** its own context window by writing snapshots before `/clear`

This design was chosen over Claude Code's Agent Teams feature after discovering that Agent Teams' permission gates create deadlocks when combined with GSD/Superpowers workflows. The tmux approach lets each workflow run natively with its own internal sub-agents.

## Security

Crewpilot runs Claude Code with `--dangerously-skip-permissions`, which disables all permission gates. This means Claude Code has **unrestricted access** to your file system and shell — it can read, write, and delete files, and execute arbitrary commands without asking for confirmation.

**Recommendations:**

- Run Crewpilot in a **dedicated project directory**, not your home directory or system directories
- Do not run Crewpilot in directories containing sensitive credentials or unrelated projects
- `human-inbox.md` is a trust boundary — the Team Lead reads and acts on its contents. Only write to it from trusted sources

The CLI warns you about this on every `crewpilot start` and `crewpilot resume` and requires confirmation before proceeding.

## Development

```bash
npm install        # install dependencies
npm run build      # compile TypeScript
npm run dev        # watch mode
npm test           # run tests
npm run test:watch # watch mode testing
npm run lint       # type check
```

## License

[MIT](LICENSE)
