# Crewpilot Features

This document describes the high-value features implemented in Crewpilot.

## Table of Contents

1. [Project Export](#project-export)
2. [Memory Search](#memory-search)
3. [Enhanced Resume](#enhanced-resume)
4. [Watch Mode](#watch-mode)

---

## Project Export

The `crewpilot export` command generates comprehensive project reports in Markdown or JSON format.

### Usage

```bash
# Export to markdown (default)
crewpilot export

# Export to JSON
crewpilot export --format json

# Custom output file
crewpilot export --output report.md

# Include communication logs
crewpilot export --include-logs
```

### Features

- **Project Summary:**
  - Project name, description, tech stack
  - Workflow used (GSD/Superpowers)
  - Session duration (calculated from archives)

- **Progress Report:**
  - Current phase/state from `.planning/STATE.md`
  - Milestones completed
  - Files created/modified

- **Decisions Made:**
  - Extracted from `communication-log.md`
  - Q&A with Runners
  - Architecture decisions with basis

- **User Research:**
  - Summary of `target-user-profile.md`
  - Key findings from `user-research/`

- **Evaluations:**
  - All files from `evaluations/` directory
  - Quality assessments

### Output Formats

**Markdown (default):**
- Professional report style with tables
- Headers, bullet lists, and code blocks
- Timestamps and metadata
- Human-readable format

**JSON:**
- Structured data for programmatic use
- Full metadata with export time and version
- Easy to parse and process

### Implementation Details

- Source: `src/commands/export.ts`
- Tests: `src/__tests__/commands/export.test.ts`
- Default filename: `crewpilot-export-YYYY-MM-DD.{md,json}`
- Supports both relative and absolute paths
- Gracefully handles missing files

---

## Memory Search

The `crewpilot search` command enables quick searching across all memory files in your project.

### Usage

```bash
# Basic search
crewpilot search "authentication patterns"

# Fuzzy matching for typos/approximate matches
crewpilot search "authentiation" --fuzzy

# Case-sensitive search
crewpilot search "API_KEY" --case-sensitive

# Rebuild index before searching
crewpilot search "api design" --rebuild-index

# Limit results
crewpilot search "react hooks" --limit 10
```

### Features

- **Searches across all memory files:**
  - `target-user-profile.md` - User preferences and context
  - `user-research/` - Interview notes and research
  - `evaluations/` - Sprint reviews and evaluations
  - `communication-log.md` - Team communication history
  - `USER-CONTEXT.md` - Project context
  - `project-context.md` - Technical specifications
  - `state-snapshot.md` - Session state
  - `team-lead-persona.md` - Team Lead instructions
  - `human-directives.md` - Human directives
  - `needs-human-decision.md` - Pending decisions

- **Smart scoring algorithm:**
  - Exact matches: +20 points
  - Word boundary matches: +10 points
  - Start-of-line matches: +5 points
  - Individual word matches: +3 points
  - Proximity bonus (all query words in same line): +5 points
  - Fuzzy match bonus (with `--fuzzy`): +3 points

- **Result grouping:** Results are grouped by file with multiple matches shown per file
- **Context display:** Shows 2 lines before and after each match
- **Term highlighting:** Matching terms are highlighted in output
- **Indexed search:** Optional JSON index for faster repeated searches
- **Sorted results:** Results sorted by relevance score
- **Fuzzy matching:** `--fuzzy` flag enables approximate matching for typos
- **Case sensitivity:** `--case-sensitive` for exact case matching
- **Performance safeguards:**
  - Skips files larger than 10MB
  - Skips binary files (null byte detection)
  - Query length limited to 200 characters
  - Deduplicates nearby matches

### Implementation Details

- Source: `src/commands/search.ts`
- Tests: `src/__tests__/commands/search.test.ts`
- Index storage: `.team-config/memory-index.json`
- Max file size: 10MB
- Context lines: 2 before and after

---

## Enhanced Resume

The `crewpilot resume` command provides intelligent session recovery with auto-detection.

### Usage

```bash
# Interactive resume with auto-detection
crewpilot resume

# Start fresh (new conversation)
crewpilot resume --fresh

# Resume without attaching
crewpilot resume --no-attach

# Auto-detect best strategy (non-interactive)
crewpilot resume --auto
```

### Features

- **Session state auto-detection:**
  - Detects existing tmux sessions
  - Checks if session has live panes
  - Reads `state-snapshot.md` for last known state
  - Analyzes timestamp to determine session age
  - Detects GSD progress from `.planning/STATE.md`

- **Flexible date parsing:** Supports multiple timestamp formats:
  - ISO 8601: `2024-01-15T10:30:00.000Z`
  - Standard: `2024-01-15 10:30:00`
  - Date only: `2024-01-15`
  - US format: `01/15/2024 10:30:00`
  - European: `15.01.2024 10:30:00`

- **Smart recommendations:**
  - `continue` - Recent snapshot exists (< 24h)
  - `review` - Old snapshot (24h-7d), ask user
  - `review` - Very old snapshot (> 7d), strongly recommend review
  - `fresh` - No state found, start new

- **Recovery options when session exists:**
  - Attach to existing session
  - Check runner status
  - Stop and restart fresh
  - Cancel

- **Robust error handling:**
  - Gracefully handles corrupted state files
  - Handles empty session recovery files
  - Handles stale pane ID files (> 7 days)
  - Multiple date format fallbacks
  - Clear error messages with actionable suggestions

### Implementation Details

- Source: `src/commands/resume.ts`
- Tests: `src/__tests__/commands/resume.test.ts`
- State analysis: `analyzeSessionState()` function with warnings collection
- Recovery prompt: Uses `session-recovery.md`
- Date parsing: `parseFlexibleDate()` handles multiple formats
- Safe file reading: `safelyReadSnapshot()` with size limits

---

## Watch Mode

The `crewpilot watch` command continuously monitors runner panes and notifies on important state changes.

### Usage

```bash
# Start watching (continuous)
crewpilot watch

# One-time status check
crewpilot check

# Custom poll interval
crewpilot watch --interval 10

# Desktop notifications only
crewpilot watch --notify desktop

# Log notifications only
crewpilot watch --notify log --log-file /path/to/log

# Both desktop and log notifications
crewpilot watch --notify both

# Rate limit notifications (minutes between same alerts)
crewpilot watch --rate-limit 10

# Single check and exit
crewpilot watch --once
```

### Features

- **State detection with confidence scoring:**
  - `working` - Spinner or progress indicators active (confidence: 0.8-0.95)
  - `idle` - Waiting for input (confidence: 0.85)
  - `question` - Multiple choice prompt detected (confidence: 0.85-1.0)
  - `error` - Error message or traceback (confidence: 0.9-1.0)
  - `stopped` - Shell prompt (confidence: 0.8)
  - `unknown` - Unclear state (confidence: 0.3)

- **Cross-platform notifications:**
  - Linux: `notify-send`
  - macOS: `osascript` (native notifications)
  - Windows: PowerShell toast notifications
  - Fallback: Console output

- **Idle duration tracking:** Shows how long a runner has been idle
- **Rate limiting:** Configurable minimum time between same-type notifications
- **Stale entry cleanup:** Automatically cleans up old pane entries to prevent memory leaks

- **Notifications sent for:**
  - **Question detected:** Human input required
  - **Error detected:** Runner encountered error
  - **Runner stopped:** Unexpected exit
  - Already-answered questions are tracked to prevent duplicate notifications

- **State Detection Patterns:**

| State | Detection Pattern |
|-------|-------------------|
| Working | `thinking`, `working`, `processing`, spinner chars (⠋, ⠙, ⏳, ⌛), progress indicators |
| Idle | `❯` prompt without spinner |
| Question | `Enter to select`, `tab/arrow keys to navigate`, numbered options (❯ 1.), choice prompts |
| Error | `error`, `exception`, `failed`, `traceback`, `undefined error`, `syntaxerror` |
| Stopped | Shell prompt patterns (`$ `, `bash-5.1$`, `user@host:path$`) |

### Implementation Details

- Source: `src/commands/watch.ts`
- Tests: `src/__tests__/commands/watch.test.ts`
- Detection: Pattern matching with confidence scoring
- Polling: Configurable interval (default 5s)
- Platform detection: `detectPlatform()` for OS-specific notifications
- Rate limiting: `NotificationManager` class with per-alert-type tracking

---

## Testing

All features include comprehensive unit tests:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/__tests__/commands/export.test.ts
npm test -- src/__tests__/commands/search.test.ts
npm test -- src/__tests__/commands/watch.test.ts
npm test -- src/__tests__/commands/resume.test.ts
```

### Test Coverage

- **Export tests:**
  - Project summary extraction
  - Communication log parsing
  - Decision extraction
  - Progress report parsing
  - Evaluation loading
  - User research aggregation
  - Markdown output generation
  - JSON output generation
  - Custom output paths
  - Missing file handling

- **Search tests:**
  - Basic search functionality
  - Fuzzy matching
  - Case sensitivity
  - Empty query handling
  - Long query handling
  - Binary file handling
  - Empty file handling
  - Result grouping
  - Index building

- **Resume tests:**
  - Existing session attachment
  - Fresh start creation
  - Auto-detection logic
  - Date format parsing
  - Corrupted file handling
  - Empty file handling
  - Permission warnings
  - Tmux error handling

- **Watch tests:**
  - State detection (all states)
  - Cross-platform notification methods
  - Rate limiting
  - Log file writing
  - Pane capture error handling
  - Multiple pane handling
  - Tmux error handling

## Architecture

The features follow the established patterns in Crewpilot:

1. **Command modules** in `src/commands/*.ts`
   - Export `run*` functions
   - Accept options object with `cwd` and feature-specific options
   - Use chalk for colored output
   - Handle errors gracefully with actionable messages

2. **CLI registration** in `src/index.ts`
   - Uses Commander.js for argument parsing
   - Consistent error handling with `process.exit(1)`

3. **Tests** in `src/__tests__/commands/*.test.ts`
   - Vitest for testing framework
   - Mock external dependencies (fs, tmux, inquirer)
   - Temporary directories for isolation
   - Cleanup in `afterEach`

## Improvements Made

### Export Improvements
1. **Comprehensive data gathering** from all relevant files
2. **Smart parsing** of communication logs for decisions
3. **Progress report extraction** from state files
4. **Multiple output formats** (Markdown and JSON)
5. **Custom output paths** with relative/absolute support
6. **Graceful handling** of missing files
7. **Professional report styling** in Markdown format

### Search Improvements
1. **Fuzzy matching** using Levenshtein distance
2. **Case-sensitive search** option
3. **Better result grouping** by file
4. **Term highlighting** in output
5. **Improved scoring algorithm** with proximity bonus
6. **Binary file detection** and skipping
7. **File size limits** (10MB max)
8. **Better error messages** with suggestions
9. **Query validation** (length limits, invalid characters)

### Resume Improvements
1. **Flexible date parsing** for multiple formats
2. **Corrupted file handling** with warnings
3. **Safe snapshot reading** with size checks
4. **Better warning system** for stale files
5. **Improved error messages** with context
6. **Staleness detection** for pane ID files
7. **Graceful tmux error handling**

### Watch Improvements
1. **Cross-platform notifications** (Linux, macOS, Windows)
2. **Confidence scoring** for state detection
3. **Idle duration tracking**
4. **Rate limiting** for notifications
5. **Memory leak prevention** with stale entry cleanup
6. **Better error patterns** for error detection
7. **Improved question detection**
8. **Platform detection** for appropriate notifications

## Future Enhancements

Potential improvements for these features:

1. **Project Export:**
   - PDF export support
   - HTML report generation
   - Custom report templates
   - Export scheduling/automation
   - Diff reports between exports
   - Integration with external tools (Notion, Confluence)

2. **Memory Search:**
   - Full-text search index (sqlite-vss, lunr)
   - Search filters (date range, file type)
   - Regex search support
   - Search result export

2. **Enhanced Resume:**
   - Git-based state recovery
   - Automatic checkpoint creation
   - Session diff visualization
   - Cross-machine sync

3. **Watch Mode:**
   - Webhook notifications
   - Slack/Discord integration
   - Email alerts
   - Historical state tracking
   - Performance metrics collection
   - Smart idle detection using activity patterns
