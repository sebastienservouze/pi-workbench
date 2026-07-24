import { useMemo, useState } from 'react'
import { Tooltip } from '../../components/Tooltip.tsx'
import type { RecentSession, SessionSummary } from '../../../shared/types.ts'
import { sessionIndicator, type SessionIndicator } from './session-indicator.ts'
import { sidebarSessions } from './sidebar-sessions.ts'

interface WorkspaceSidebarProps {
  completedSessionIds: ReadonlySet<string>
  recentSessions: RecentSession[]
  sessions: SessionSummary[]
  selectedId: string
  workspacePath: string
  theme: string
  onChooseWorkspace: () => void
  onCreate: () => Promise<void>
  onOpenSession: (session: RecentSession) => Promise<void>
  onSelectSession: (sessionId: string) => void
  onToggleTheme: () => void
  onOpenSettings: () => void
  onError: (cause: unknown) => void
}

/** Displays the current workspace and opens or selects its recent Pi sessions. */
export function WorkspaceSidebar({ completedSessionIds, recentSessions, sessions, selectedId, workspacePath, theme, onChooseWorkspace, onCreate, onOpenSession, onSelectSession, onToggleTheme, onOpenSettings, onError }: WorkspaceSidebarProps) {
  const [openingSessionPath, setOpeningSessionPath] = useState('')
  const visibleSessions = useMemo(() => sidebarSessions(recentSessions, sessions, workspacePath), [recentSessions, sessions, workspacePath])

  return <aside className="sidebar">
    <div className="brand">
      <span className="brand-mark">π</span>
      <div><strong>Pi Workbench</strong><small>Local workspace</small></div>
      <Tooltip label={theme === 'dark' ? 'Light theme' : 'Dark theme'}><button aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="theme-toggle" onClick={onToggleTheme} type="button">
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button></Tooltip>
      <Tooltip label="Settings"><button aria-label="Open settings" className="theme-toggle" onClick={onOpenSettings} type="button">
        <SettingsIcon />
      </button></Tooltip>
    </div>
    <div className="workspace-group">
      <Tooltip label={workspacePath}><button className="workspace-path" onClick={onChooseWorkspace} type="button">
        <span>Current directory</span><strong>{workspacePath}</strong>
      </button></Tooltip>
    </div>
    <NewSessionButton onCreate={onCreate} onError={onError} />
    <nav className="session-list" aria-label="Recent Pi sessions">
      {visibleSessions.map((recentSession) => {
        const activeSession = sessions.find((session) => session.sessionPath === recentSession.sessionPath && session.status !== 'exited')
        const indicator = sessionIndicator(activeSession, selectedId, completedSessionIds)
        return (
          <Tooltip key={recentSession.sessionPath} label={recentSession.name}><button
            className={activeSession?.id === selectedId ? 'session-item selected' : 'session-item'}
            disabled={openingSessionPath === recentSession.sessionPath}
            onClick={() => {
              if (activeSession) {
                onSelectSession(activeSession.id)
                return
              }
              setOpeningSessionPath(recentSession.sessionPath)
              void onOpenSession(recentSession).catch(onError).finally(() => setOpeningSessionPath(''))
            }}
            type="button"
          >
            {indicator && <SessionStatusIndicator status={indicator} />}
            <span><strong>{openingSessionPath === recentSession.sessionPath ? 'Opening…' : recentSession.name}</strong><small>{new Date(recentSession.updatedAt).toLocaleString('en-US')}</small></span>
          </button></Tooltip>
        )
      })}
      {visibleSessions.length === 0 && <p className="empty-sidebar">No Pi sessions in this directory.</p>}
    </nav>
  </aside>
}

const indicatorLabels: Record<SessionIndicator, string> = {
  working: 'Pi is working',
  waiting: 'Pi is waiting for your response',
  complete: 'Pi finished its turn',
}

/** Uses one visual vocabulary for active, attention, and completed session states. */
function SessionStatusIndicator({ status }: { status: SessionIndicator }) {
  return <Tooltip label={indicatorLabels[status]}><span aria-label={indicatorLabels[status]} className={`session-status-indicator ${status}`} role="img">
    {status === 'working' && <svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" /></svg>}
    {status === 'waiting' && <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3 3.5h10v7H8l-3 2v-2H3z" /><path d="M6.6 6a1.5 1.5 0 0 1 2.8.7c0 1-1.4 1-1.4 2" /><path d="M8 9.5h.01" /></svg>}
    {status === 'complete' && <svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" /><path d="m5.5 8 1.6 1.6 3.5-3.5" /></svg>}
  </span></Tooltip>
}

/** Prevents duplicate session creation and reports errors to the container. */
function NewSessionButton({ onCreate, onError }: { onCreate: () => Promise<void>; onError: (cause: unknown) => void }) {
  const [busy, setBusy] = useState(false)

  async function create(): Promise<void> {
    setBusy(true)
    try {
      await onCreate()
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  return <button className="new-session" disabled={busy} onClick={() => void create()} type="button">{busy ? 'Starting…' : '＋ New session'}</button>
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="16">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SettingsIcon() {
  return <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="16"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="m19.4 15 .1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.9 1.9 0 0 0-3.2 1.3v.2a2 2 0 1 1-4 0v-.2a1.9 1.9 0 0 0-3.2-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.9 1.9 0 0 0 2.2 12a1.9 1.9 0 0 0 1.2-3.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.9 1.9 0 0 0 3.2-1.3v-.2a2 2 0 1 1 4 0v.2a1.9 1.9 0 0 0 3.2 1.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.9 1.9 0 0 0 20.8 12a1.9 1.9 0 0 0-1.4 3Z" /></svg>
}

function SunIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="16">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}
