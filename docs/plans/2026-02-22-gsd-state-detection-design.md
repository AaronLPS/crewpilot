# GSD State Detection Design Document

> Date: 2026-02-22
> Status: Implemented
> Commit: d157ac1

## Problem

When `crewpilot init --existing` is run on a project that already has GSD state (`.planning/STATE.md`, `ROADMAP.md`, etc.), the Team Lead's startup workflow unconditionally launches `/gsd:new-project`. This overwrites or conflicts with the existing GSD project state.

## Solution

Add GSD state detection to the Team Lead persona template (`teamLeadPersonaTemplate()` in `src/templates.ts`). The Team Lead checks for `.planning/STATE.md` before choosing a workflow, and routes to the appropriate GSD resume command based on project state.

## Design

### Detection Logic (in Team Lead persona instructions)

The "Project Startup Workflow" section gains new steps 5-6:

1. Check if `.planning/STATE.md` exists
2. If yes — read it along with `.planning/ROADMAP.md` to understand current state
3. Summarize findings to the human (current phase, progress, remaining work)
4. Present options and let the human choose:

| Option | GSD command |
|---|---|
| Resume where you left off | `/gsd:resume-work` |
| Review roadmap and reprioritize | `/gsd:progress` |
| Start a new milestone with different goals | `/gsd:new-milestone` |
| Insert urgent work before the next phase | `/gsd:insert-phase` |
| Ignore existing state and start fresh | `/gsd:new-project` |
| Switch to Superpowers workflow instead | `/superpowers:brainstorming` |

If no `.planning/STATE.md` exists, the workflow proceeds as before (choose between `/gsd:new-project` and Superpowers).

The human makes the call — the Team Lead does not auto-resume.

### Changes

**Template only** — no TypeScript logic changes. The detection is performed by the Team Lead agent at runtime by reading files, not by Crewpilot CLI code.

Two sections of `teamLeadPersonaTemplate()` in `src/templates.ts` were modified:

1. **Project Startup Workflow** — Added step 5 (GSD detection) and step 6 (present options to human), renumbered subsequent steps
2. **Launching a Runner** — Added existing-GSD code block and expanded the "Choosing the workflow" reference list

The live `.team-config/team-lead-persona.md` was updated to match (this file is gitignored as a local runtime artifact).

### Approach Considered and Rejected

- **Init-time detection** (`init.ts` writes GSD flag to `project-context.md`) — Rejected because state can change between `init` and `start`
- **Start-time detection** (`start.ts` adjusts bootstrap prompt) — Rejected because it duplicates logic that the Team Lead can perform itself
- **Template-only approach** — Chosen. Minimal code change, all logic in persona instructions where startup decisions already live

## Superpowers Gap (Not Implemented)

Superpowers has no centralized state file equivalent to `.planning/STATE.md`. Its state must be inferred from scattered artifacts:

| Artifact | Phase indicated |
|---|---|
| `docs/plans/*-design.md` exists, no plan file | Brainstorming done |
| `docs/plans/*-implementation.md` exists | Planning done |
| Feature branch with commits + plan file | Execution in progress |
| All plan tasks committed, no merge/PR | Execution done |

Additionally, Superpowers has no resume command — the Runner would need to be told which skill to invoke based on detected phase. This is feasible but fragile and deferred to a future iteration.
