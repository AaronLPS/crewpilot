import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import express from 'express'
import chalk from 'chalk'
import { teamConfigExists } from '../scaffold.js'
import { getProjectName, getSessionName } from '../utils.js'
import { sessionExists, listPanes, capturePaneContent, PaneInfo } from '../tmux.js'

/**
 * Dashboard configuration options
 */
interface DashboardOptions {
  port?: number
  refreshRate?: number
  cwd?: string
}

/**
 * Runner state information
 */
interface RunnerState {
  paneId: string
  state: 'working' | 'idle' | 'question' | 'error' | 'stopped' | 'unknown'
  details: string
  content: string
}

/**
 * Dashboard data structure
 */
interface DashboardData {
  projectName: string
  sessionName: string
  sessionActive: boolean
  timestamp: string
  runners: RunnerState[]
  stateSnapshot: string
  pendingDecisions: string
}

/**
 * State detection patterns (reused from watch.ts)
 */
const WORKING_INDICATORS = [
  'proofing', 'mustering', 'thinking', 'working', 'processing',
  'analyzing', 'generating', '⌛', '⏳', '⠋', '⠙', '⠹', '⠸',
  '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'
]

const ERROR_PATTERNS = ['error', 'exception', 'failed', 'traceback']

/**
 * Detect runner state from captured pane content
 */
function detectState(content: string): RunnerState['state'] {
  const lines = content.split('\n')
  const lastLines = lines.slice(-20).join('\n').toLowerCase()

  // Check for error indicators
  if (ERROR_PATTERNS.some(pattern => lastLines.includes(pattern))) {
    return 'error'
  }

  // Check for AskUserQuestion pattern
  if (
    lastLines.includes('enter to select') ||
    lastLines.includes('tab/arrow keys to navigate') ||
    /❯\s*\d+\./.test(lastLines)
  ) {
    return 'question'
  }

  // Check for working indicators
  if (WORKING_INDICATORS.some(indicator => lastLines.includes(indicator))) {
    return 'working'
  }

  // Check for idle prompt
  if (lastLines.includes('❯') && !lastLines.match(/[⌛⏳⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)) {
    return 'idle'
  }

  // Check if pane shows shell prompt (stopped)
  if (lastLines.includes('$') || lastLines.includes('bash') || lastLines.includes('zsh')) {
    return 'stopped'
  }

  return 'unknown'
}

/**
 * Get runner states for all panes
 */
function getRunnerStates(sessionName: string): RunnerState[] {
  const states: RunnerState[] = []
  const panes = listPanes(sessionName)

  for (const pane of panes) {
    const content = capturePaneContent(pane.id, 100)
    const state = detectState(content)
    const lines = content.split('\n').filter(l => l.trim())
    const details = lines.slice(-3).join(' | ').slice(0, 100)

    states.push({
      paneId: pane.id,
      state,
      details,
      content: content.slice(-2000) // Last 2000 chars for display
    })
  }

  return states
}

/**
 * Read file content or return empty string
 */
function readFileOrEmpty(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch {
    return ''
  }
}

/**
 * Generate dashboard HTML
 */
function generateDashboardHTML(data: DashboardData, refreshRate: number): string {
  const runnerRows = data.runners.map(runner => {
    const stateClass = runner.state
    const stateIcon = {
      working: '●',
      idle: '○',
      question: '?',
      error: '✖',
      stopped: '■',
      unknown: '?'
    }[runner.state]

    return `
      <div class="runner ${stateClass}">
        <div class="runner-header">
          <span class="state-icon">${stateIcon}</span>
          <span class="pane-id">${runner.paneId}</span>
          <span class="state-badge ${stateClass}">${runner.state.toUpperCase()}</span>
        </div>
        <div class="runner-details">${escapeHtml(runner.details)}</div>
        <pre class="terminal-content">${escapeHtml(runner.content)}</pre>
      </div>
    `
  }).join('')

  const sessionStatus = data.sessionActive
    ? '<span class="badge active">Active</span>'
    : '<span class="badge inactive">Inactive</span>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crewpilot Dashboard - ${escapeHtml(data.projectName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      line-height: 1.6;
    }
    .header {
      background: #16213e;
      padding: 1.5rem;
      border-bottom: 2px solid #0f3460;
    }
    .header h1 {
      color: #e94560;
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }
    .header-meta {
      color: #888;
      font-size: 0.9rem;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.5rem;
    }
    .status-bar {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    .badge {
      padding: 0.3rem 0.8rem;
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .badge.active { background: #10b981; color: #fff; }
    .badge.inactive { background: #6b7280; color: #fff; }
    .info-box {
      background: #16213e;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      border-left: 4px solid #0f3460;
    }
    .info-box h3 {
      color: #e94560;
      font-size: 0.9rem;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
    }
    .info-box pre {
      color: #aaa;
      font-size: 0.85rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .runners-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 1rem;
    }
    .runner {
      background: #16213e;
      border-radius: 8px;
      overflow: hidden;
      border: 2px solid #0f3460;
    }
    .runner.working { border-color: #3b82f6; }
    .runner.idle { border-color: #f59e0b; }
    .runner.question { border-color: #a855f7; }
    .runner.error { border-color: #ef4444; }
    .runner.stopped { border-color: #6b7280; }
    .runner-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: #0f3460;
    }
    .state-icon {
      font-size: 1.2rem;
    }
    .runner.working .state-icon { color: #3b82f6; }
    .runner.idle .state-icon { color: #f59e0b; }
    .runner.question .state-icon { color: #a855f7; }
    .runner.error .state-icon { color: #ef4444; }
    .runner.stopped .state-icon { color: #6b7280; }
    .pane-id {
      font-family: monospace;
      color: #aaa;
    }
    .state-badge {
      margin-left: auto;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: bold;
    }
    .state-badge.working { background: #3b82f6; color: #fff; }
    .state-badge.idle { background: #f59e0b; color: #000; }
    .state-badge.question { background: #a855f7; color: #fff; }
    .state-badge.error { background: #ef4444; color: #fff; }
    .state-badge.stopped { background: #6b7280; color: #fff; }
    .runner-details {
      padding: 0.5rem 1rem;
      color: #888;
      font-size: 0.85rem;
      border-bottom: 1px solid #0f3460;
    }
    .terminal-content {
      padding: 1rem;
      background: #0d1117;
      color: #c9d1d9;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.8rem;
      line-height: 1.5;
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
    }
    .update-indicator {
      position: fixed;
      top: 1rem;
      right: 1rem;
      padding: 0.5rem 1rem;
      background: #10b981;
      color: #fff;
      border-radius: 4px;
      font-size: 0.85rem;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .update-indicator.show { opacity: 1; }
    .no-runners {
      text-align: center;
      padding: 3rem;
      color: #888;
    }
    @media (max-width: 768px) {
      .runners-grid { grid-template-columns: 1fr; }
      .container { padding: 1rem; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 Crewpilot Dashboard</h1>
    <div class="header-meta">
      ${escapeHtml(data.projectName)} · Session: ${escapeHtml(data.sessionName)} · ${sessionStatus}
    </div>
  </div>

  <div class="container">
    <div class="status-bar">
      <span class="badge active">${data.runners.length} Runner${data.runners.length !== 1 ? 's' : ''}</span>
      <span class="badge">Updated: ${new Date(data.timestamp).toLocaleTimeString()}</span>
    </div>

    ${data.stateSnapshot ? `
    <div class="info-box">
      <h3>📸 State Snapshot</h3>
      <pre>${escapeHtml(data.stateSnapshot)}</pre>
    </div>
    ` : ''}

    ${data.pendingDecisions ? `
    <div class="info-box" style="border-left-color: #e94560;">
      <h3>⚠️ Pending Decisions</h3>
      <pre>${escapeHtml(data.pendingDecisions)}</pre>
    </div>
    ` : ''}

    <div class="runners-grid">
      ${runnerRows || '<div class="no-runners">No active runners found</div>'}
    </div>
  </div>

  <div id="update-indicator" class="update-indicator">Updated</div>

  <script>
    // Auto-refresh with SSE
    const eventSource = new EventSource('/events');
    const indicator = document.getElementById('update-indicator');

    eventSource.addEventListener('update', function(e) {
      // Show update indicator
      indicator.classList.add('show');
      setTimeout(() => indicator.classList.remove('show'), 1000);
      
      // Reload page to get fresh data
      window.location.reload();
    });

    eventSource.onerror = function() {
      console.log('SSE connection lost, retrying...');
    };

    // Fallback: refresh page every ${refreshRate} seconds if SSE fails
    setInterval(() => {
      if (eventSource.readyState !== EventSource.OPEN) {
        window.location.reload();
      }
    }, ${refreshRate * 1000});
  </script>
</body>
</html>`
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Get dashboard data
 */
function getDashboardData(cwd: string): DashboardData {
  const userContext = readFileOrEmpty(path.join(cwd, '.team-config', 'USER-CONTEXT.md'))
  const projectName = getProjectName(userContext) ?? path.basename(cwd)
  const sessionName = getSessionName(projectName)
  const sessionActive = sessionExists(sessionName)

  const runners = sessionActive ? getRunnerStates(sessionName) : []

  return {
    projectName,
    sessionName,
    sessionActive,
    timestamp: new Date().toISOString(),
    runners,
    stateSnapshot: readFileOrEmpty(path.join(cwd, '.team-config', 'state-snapshot.md')),
    pendingDecisions: readFileOrEmpty(path.join(cwd, '.team-config', 'needs-human-decision.md'))
  }
}

/**
 * Start the dashboard server
 */
export async function runDashboard(options: DashboardOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  const port = options.port ?? 3000
  const refreshRate = options.refreshRate ?? 5

  if (!teamConfigExists(cwd)) {
    console.log(chalk.red(`No .team-config/ found. Run ${chalk.cyan('crewpilot init')} first.`))
    process.exit(1)
  }

  const app = express()
  const server = http.createServer(app)

  // Store connected SSE clients
  const clients: http.ServerResponse[] = []

  // SSE endpoint for live updates
  app.get('/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })

    // Send initial connection message
    res.write('event: connected\ndata: {}\n\n')

    clients.push(res)

    req.on('close', () => {
      const index = clients.indexOf(res)
      if (index > -1) {
        clients.splice(index, 1)
      }
    })
  })

  // Main dashboard page
  app.get('/', (req, res) => {
    const data = getDashboardData(cwd)
    res.send(generateDashboardHTML(data, refreshRate))
  })

  // API endpoint for JSON data
  app.get('/api/status', (req, res) => {
    res.json(getDashboardData(cwd))
  })

  // Start server
  server.listen(port, () => {
    console.log(chalk.bold(`\n── Crewpilot Dashboard ──\n`))
    console.log(chalk.green(`Server running at http://localhost:${port}`))
    console.log(chalk.gray(`Refresh rate: ${refreshRate}s`))
    console.log(chalk.gray(`Press Ctrl+C to stop\n`))
  })

  // Periodically broadcast updates to SSE clients
  const updateInterval = setInterval(() => {
    const deadClients: number[] = []

    clients.forEach((client, index) => {
      try {
        client.write('event: update\ndata: {"timestamp": "' + new Date().toISOString() + '"}\n\n')
      } catch {
        deadClients.push(index)
      }
    })

    // Remove dead clients
    deadClients.reverse().forEach(index => {
      clients.splice(index, 1)
    })
  }, refreshRate * 1000)

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(updateInterval)
    server.close(() => {
      console.log(chalk.gray('\nDashboard stopped.'))
      process.exit(0)
    })
  })

  process.on('SIGTERM', () => {
    clearInterval(updateInterval)
    server.close(() => {
      process.exit(0)
    })
  })
}
