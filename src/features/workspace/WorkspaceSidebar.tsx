import { useState } from 'react'
import type { RecentSession, SessionSummary } from '../../../shared/types.ts'

interface WorkspaceSidebarProps {
  recentSessions: RecentSession[]
  sessions: SessionSummary[]
  selectedId: string
  workspacePath: string
  onChooseWorkspace: () => void
  onCreate: () => Promise<void>
  onOpenSession: (session: RecentSession) => Promise<void>
  onSelectSession: (sessionId: string) => void
  onError: (cause: unknown) => void
}

/** Affiche le workspace courant et ouvre ou sélectionne ses sessions Pi récentes. */
export function WorkspaceSidebar({ recentSessions, sessions, selectedId, workspacePath, onChooseWorkspace, onCreate, onOpenSession, onSelectSession, onError }: WorkspaceSidebarProps) {
  const [openingSessionPath, setOpeningSessionPath] = useState('')

  return <aside className="sidebar">
    <div className="brand">
      <span className="brand-mark">π</span>
      <div><strong>Pi Workbench</strong><small>Local workspace</small></div>
    </div>
    <div className="workspace-group">
      <button className="workspace-path" onClick={onChooseWorkspace} title={workspacePath} type="button">
        <span>Dossier courant</span><strong>{workspacePath}</strong>
      </button>
    </div>
    <NewSessionButton onCreate={onCreate} onError={onError} />
    <nav className="session-list" aria-label="Sessions Pi récentes">
      {recentSessions.map((recentSession) => {
        const activeSession = sessions.find((session) => session.sessionPath === recentSession.sessionPath && session.status !== 'exited')
        return (
          <button
            className={activeSession?.id === selectedId ? 'session-item selected' : 'session-item'}
            disabled={openingSessionPath === recentSession.sessionPath}
            key={recentSession.sessionPath}
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
            {activeSession?.status === 'running' && <span className="status-dot" aria-label="Agent en cours de travail" role="img" />}
            <span><strong>{openingSessionPath === recentSession.sessionPath ? 'Ouverture…' : recentSession.name}</strong><small>{new Date(recentSession.updatedAt).toLocaleString('fr-FR')}</small></span>
          </button>
        )
      })}
      {recentSessions.length === 0 && <p className="empty-sidebar">Aucune session Pi dans ce dossier.</p>}
    </nav>
  </aside>
}

/** Empêche les doubles créations de session et remonte les erreurs au conteneur. */
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

  return <button className="new-session" disabled={busy} onClick={() => void create()} type="button">{busy ? 'Démarrage…' : '＋ Nouvelle session'}</button>
}
