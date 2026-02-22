# Crewpilot - Project Brief

## What is Crewpilot

Crewpilot is a CLI tool that bootstraps and manages an AI Agent Team framework on top of Claude Code. It sets up a Team Lead (acting as User Proxy) that autonomously drives GSD/Superpowers workflows through tmux, replacing the human in interactive questioning phases.

See `agent-team-architecture-v2.md` for the full architecture specification. That document is the single source of truth for what Crewpilot needs to support.

## Core Commands

### `crewpilot init`

Interactive scaffolding for a new project.

Prompts the user for:
- Project name and description
- Target user description (who is this for?)
- Tech stack / constraints
- Preferred workflow (GSD / Superpowers / ask-me-later)

Creates:
```
.team-config/
├── team-lead-persona.md          # Pre-filled with User Proxy behavior rules
├── target-user-profile.md        # Pre-filled template with user's input
├── USER-CONTEXT.md               # Pre-filled from project description
├── project-context.md            # Empty template (or auto-detected if --existing)
├── session-recovery.md           # Empty template
├── state-snapshot.md             # Empty
├── communication-log.md          # Empty
├── human-inbox.md                # Empty (with usage instructions header)
├── human-directives.md           # Empty
├── needs-human-decision.md       # Empty
├── runner-pane-id.txt            # Empty
├── user-research/                # Empty dir
├── evaluations/                  # Empty dir
└── archives/                     # Empty dir
```

Also appends to or creates `CLAUDE.md` with:
- Reference to `.team-config/team-lead-persona.md`
- Team Lead behavioral instructions
- Reference to architecture doc

Flags:
- `--existing` : Scan current codebase, auto-generate `project-context.md` with detected languages, frameworks, directory structure
- `--workflow gsd|superpowers` : Skip the workflow selection prompt
- `--name "Project Name"` : Skip the project name prompt

### `crewpilot start`

Launches the full framework.

Steps:
1. Verify `.team-config/` exists (error if not, suggest `crewpilot init`)
2. Create a new tmux session named `crewpilot-{project-name}`
3. Pane 0: Launch Claude Code with `claude --dangerously-skip-permissions`
4. Auto-inject initial prompt that tells Team Lead to:
   - Read `.team-config/team-lead-persona.md`
   - Read `.team-config/target-user-profile.md`
   - Read `.team-config/USER-CONTEXT.md`
   - Begin the User Proxy → Runner launch → polling loop workflow
5. Print instructions for the human (how to interact, how to pause, etc.)

Flags:
- `--attach` : Attach to the tmux session after creation (default: true)
- `--no-attach` : Create but don't attach (background mode)

### `crewpilot resume`

Resumes an interrupted project.

Steps:
1. Check for existing tmux session `crewpilot-{project-name}`
   - If exists and has live panes → attach to it
   - If not → create new session
2. Launch Claude Code with `claude --resume` (or `--continue`)
3. Auto-inject prompt telling Team Lead to read `session-recovery.md` and restore state

### `crewpilot status`

Quick status check without entering the tmux session.

Reads and displays:
- `.team-config/state-snapshot.md` (last known state)
- `.planning/STATE.md` (GSD progress, if exists)
- Active tmux panes (`tmux list-panes`)
- `needs-human-decision.md` (any pending decisions)

Output format: clean terminal output with colors.

### `crewpilot feedback "message"`

Write async feedback without entering the tmux session.

Appends timestamped message to `.team-config/human-inbox.md`.

### `crewpilot stop`

Gracefully stops the framework.

Steps:
1. Send `/exit` to all Runner panes via tmux send-keys
2. Wait briefly for graceful shutdown
3. Send stop signal to Team Lead pane
4. Kill the tmux session
5. Final state is preserved in `.team-config/` files

## Technical Requirements

- Language: Node.js (TypeScript)
- CLI framework: Commander.js or similar
- tmux interaction: Child process exec of tmux commands
- Interactive prompts: Inquirer.js or similar
- No AI/LLM calls in the CLI itself — all intelligence lives in Claude Code sessions
- Installable globally via npm: `npm install -g crewpilot`
- Minimum Node version: 18

## Template Content

The `team-lead-persona.md` template is critical. It should contain the complete behavioral specification for the Team Lead, including:

1. The three roles (User Proxy, tmux Manager, Review & Evaluate)
2. The polling loop logic
3. tmux command reference (capture-pane, send-keys syntax with delays)
4. AskUserQuestion UI detection patterns
5. Context management rules (/clear thresholds, snapshot timing)
6. File references (which files to read/write and when)
7. How to launch a Runner (tmux split + claude --dangerously-skip-permissions + workflow command)
8. How to answer Runner questions (read question → consult user profile → send-keys)
9. Session recovery instructions
10. Human inbox checking protocol

This template should be derived from the architecture document but formatted as direct instructions to the Team Lead agent.

## Out of Scope (for v1)

- GUI / web dashboard
- Multi-machine / remote tmux
- Custom workflow plugins (only GSD and Superpowers)
- Automatic model selection (always Opus)
- Cost tracking / token monitoring
