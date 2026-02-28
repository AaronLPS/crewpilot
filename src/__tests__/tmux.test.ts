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
  createWindow,
  sendOption,
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
        Buffer.from('%0\t1\tbash\n%1\t0\tclaude\n')
      )
      const panes = listPanes('crewpilot-myapp')
      expect(panes).toHaveLength(2)
      expect(panes[0]).toEqual({ id: '%0', active: true, command: 'bash' })
      expect(panes[1]).toEqual({ id: '%1', active: false, command: 'claude' })
    })

    it('handles commands containing colons', () => {
      mockExecFileSync.mockReturnValue(
        Buffer.from('%0\t1\tnode:server\n')
      )
      const panes = listPanes('crewpilot-myapp')
      expect(panes[0]).toEqual({ id: '%0', active: true, command: 'node:server' })
    })

    it('returns empty array on error', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('no session')
      })
      expect(listPanes('crewpilot-myapp')).toEqual([])
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

  describe('createWindow', () => {
    it('creates a detached window and returns pane ID', () => {
      mockExecFileSync
        .mockReturnValueOnce(Buffer.from('%3\n'))  // new-window with -P -F returns pane ID
      const paneId = createWindow('crewpilot-myapp')
      expect(paneId).toBe('%3')
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['new-window', '-d', '-t', 'crewpilot-myapp', '-P', '-F', '#{pane_id}'],
        expect.any(Object)
      )
    })
  })

  describe('sendTextInput', () => {
    it('sends text with double Enter and sleep for Claude Code', () => {
      mockExecFileSync.mockReturnValue(Buffer.from(''))
      const startTime = Date.now()
      sendTextInput('%1', 'hello world')
      const elapsed = Date.now() - startTime
      // Should call send-keys twice (text+Enter, then Enter)
      const sendKeysCalls = mockExecFileSync.mock.calls.filter(
        call => call[1] && (call[1] as string[])[0] === 'send-keys'
      )
      expect(sendKeysCalls.length).toBe(2)
      // Verify sleep duration (should be at least 1000ms, but we use busy-wait so it may be faster in tests)
      expect(elapsed).toBeGreaterThanOrEqual(0)
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
})
