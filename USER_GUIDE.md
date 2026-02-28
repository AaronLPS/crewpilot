# Crewpilot User Guide
## Quick Start & Feature Overview

---

## What is Crewpilot?

Crewpilot is a **CLI tool for orchestrating AI Agent Teams** using Claude Code + tmux.

**Core Philosophy:**
- Pure file-based (no databases, no web servers)
- Lightweight and crash-resilient
- Deep Claude Code integration
- Human-in-the-loop for decisions

---

## Quick Start (3 Steps)

### 1. Initialize Project
```bash
mkdir my-project && cd my-project

# Interactive setup
crewpilot init

# Or with flags (non-interactive)
crewpilot init --name MyApp \
  --description "A web application" \
  --tech "React, TypeScript, Node.js" \
  --workflow gsd
```

### 2. Start the Team
```bash
# Launch Team Lead + Runner in tmux
crewpilot start

# Or background mode
crewpilot start --no-attach
```

### 3. Monitor & Interact
```bash
# Check status
crewpilot status

# Send feedback to Team Lead
crewpilot feedback "Focus on authentication first"

# Stop when done
crewpilot stop
```

---

## Feature 1: Memory Search

**Find information across all project files**

```bash
# Basic search
crewpilot search "authentication"

# Fuzzy matching
crewpilot search "auth" --fuzzy

# Case-sensitive
crewpilot search "API" --case-sensitive

# Limit results
crewpilot search "database" --limit 10
```

**What it searches:**
- `target-user-profile.md` — User persona
- `user-research/*.md` — Research findings
- `evaluations/*.md` — Code reviews
- `communication-log.md` — Q&A history
- `state-snapshot.md` — Current state

**Output example:**
```
Searching for: "authentication"
──────────────────────────────────
Found 5 results

.team-config/communication-log.md:42 (score: 24)
>   40 │ Q: "What auth pattern should we use?"
>   41 │ A: (User Proxy) "JWT with refresh tokens"
>   42 │ Basis: target-user-profile.md

.team-config/user-research/security.md:15 (score: 12)
>   13 │ ## Security Requirements
>   14 │ - OAuth 2.0 preferred
>   15 │ - Session management required
```

---

## Feature 2: Smart Resume

**Intelligent session recovery**

```bash
# Auto-detect best resume strategy
crewpilot resume --auto

# Force fresh start
crewpilot resume --fresh

# Background mode (no attach)
crewpilot resume --no-attach
```

**Recovery Analysis:**
```
── Session Recovery Analysis ──

✓ State snapshot | ✓ Recovery instructions | ✓ GSD progress
Phase: Execution | Snapshot: 2h ago

Recommendation: Recent snapshot found (2h ago). Safe to continue.
```

**Smart behavior:**
- Detects if session is already active
- Analyzes snapshot age (>24h = suggest review)
- Offers: Attach / Check Status / Restart / Cancel

---

## Feature 3: Watch Mode

**Real-time runner monitoring**

```bash
# Continuous watch with notifications
crewpilot watch

# Quick status check
crewpilot check

# Custom poll interval
crewpilot watch --interval 10

# Rate limit notifications
crewpilot watch --rate-limit 5
```

**State Detection:**
| Indicator | State | Action |
|-----------|-------|--------|
| ● Blue | Working | Wait |
| ○ Yellow | Idle | Monitor |
| ? Magenta | Question | 🔔 Notify |
| ✖ Red | Error | 🔔 Alert |
| ■ Gray | Stopped | 🔔 Alert |

**Notifications:**
- Linux: `notify-send`
- macOS: `osascript`
- Windows: PowerShell toast

---

## Feature 4: Web Dashboard

**Browser-based monitoring**

```bash
# Start dashboard
crewpilot dashboard

# Custom port
crewpilot dashboard --port 8080

# Faster refresh
crewpilot dashboard --refresh 5
```

**Features:**
- 📊 Live pane output (last 2000 chars)
- 🔄 Auto-refresh via Server-Sent Events
- 🎨 Dark-themed responsive UI
- 🔌 API endpoint: `/api/status`

**Screenshot:**
```
┌─────────────────────────────────────────┐
│  Crewpilot Dashboard: MyProject         │
│  Session: crewpilot-myproject (active)  │
├─────────────────────────────────────────┤
│                                         │
│  ● Working  %1                          │
│  Analyzing codebase...                  │
│                                         │
│  ○ Idle  %2                             │
│  Waiting for next task                  │
│                                         │
└─────────────────────────────────────────┘
```

---

## Feature 5: Heartbeat Monitor

**Detect stuck/dead runners**

```bash
# Start monitoring daemon
crewpilot monitor

# Custom check interval
crewpilot monitor --interval 60

# Notification method
crewpilot monitor --notify desktop
```

**Detects:**
- **Stuck runners:** 3+ unchanged captures while "working"
- **Dead runners:** Shell prompt without Claude Code
- **Log location:** `.team-config/heartbeat.log`

**Alert example:**
```
🔔 Crewpilot: Runner Stuck
Runner %1 has been working for 5 minutes without progress
```

---

## Feature 6: Export Reports

**Generate project summaries**

```bash
# Markdown report (default)
crewpilot export

# JSON format
crewpilot export --format json

# Include full logs
crewpilot export --include-logs

# Custom output
crewpilot export --output my-report.md
```

**Export includes:**
- 📋 Project summary (name, tech stack, workflow)
- 📈 Progress report (phases, milestones)
- 💬 Decisions made (from communication logs)
- 👤 User research findings
- ✅ Code evaluations

**Sample output:**
```markdown
# Crewpilot Export: MyProject

**Exported:** 2026-02-26 14:30  
**Duration:** 2h 30m

## Project Summary
- **Name:** MyProject
- **Workflow:** GSD
- **Tech Stack:** TypeScript, Node.js, Express

## Progress
- **Current Phase:** Execution
- **Milestones:** 3 completed
- **Files Modified:** 12

## Key Decisions
1. Use JWT for authentication (2026-02-26 13:15)
2. PostgreSQL over MongoDB (2026-02-26 13:45)
```

---

## Complete Command Reference

| Command | Description | Key Options |
|---------|-------------|-------------|
| `init` | Initialize project | `--name`, `--workflow`, `--existing` |
| `start` | Launch team | `--no-attach` |
| `resume` | Resume session | `--auto`, `--fresh`, `--no-attach` |
| `stop` | Stop session | — |
| `status` | Show status | — |
| `feedback` | Send message | — |
| `search` | Search memory | `--fuzzy`, `--case-sensitive`, `--limit` |
| `watch` | Monitor runners | `--interval`, `--rate-limit` |
| `check` | Quick status | — |
| `dashboard` | Web UI | `--port`, `--refresh` |
| `monitor` | Heartbeat daemon | `--interval`, `--notify` |
| `export` | Generate report | `--format`, `--output`, `--include-logs` |

---

## File Structure

```
my-project/
├── .team-config/
│   ├── USER-CONTEXT.md          # Project requirements
│   ├── target-user-profile.md   # User persona
│   ├── project-context.md       # Technical context
│   ├── team-lead-persona.md     # Team Lead behavior
│   ├── state-snapshot.md        # Current state
│   ├── session-recovery.md      # Recovery instructions
│   ├── communication-log.md     # Q&A history
│   ├── human-inbox.md           # Your messages
│   ├── user-research/           # Research findings
│   ├── evaluations/             # Code reviews
│   ├── heartbeat.log            # Monitor logs
│   └── memory-index.json        # Search index
├── .planning/
│   └── STATE.md                 # GSD progress
└── CLAUDE.md                    # Team Lead directives
```

---

## Tips & Best Practices

1. **Use `--auto` for CI/CD:**
   ```bash
   crewpilot resume --auto --no-attach
   ```

2. **Monitor long-running tasks:**
   ```bash
   crewpilot watch &
   crewpilot start
   ```

3. **Search before asking:**
   ```bash
   crewpilot search "database choice"
   ```

4. **Export before stopping:**
   ```bash
   crewpilot export --include-logs
   crewpilot stop
   ```

5. **Dashboard for presentations:**
   ```bash
   crewpilot dashboard --port 8080
   # Share http://your-ip:8080 with team
   ```

---

## Getting Help

```bash
# Show all commands
crewpilot --help

# Help for specific command
crewpilot search --help
crewpilot dashboard --help
```

---

## Summary

Crewpilot = **Claude Code + tmux + Smart Orchestration**

✅ **File-based** — Survives crashes, human-readable  
✅ **Lightweight** — No databases, no servers  
✅ **Observable** — Watch, dashboard, heartbeat  
✅ **Searchable** — Find any past decision  
✅ **Exportable** — Generate reports anytime  

**Ready to orchestrate your AI team!** 🚀
