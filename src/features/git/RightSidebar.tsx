import { useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { GitActionResult, GitFileDiff, GitRevertResult, GitSnapshot } from '../../../shared/types.ts'
import { TodoWidget } from '../todo/TodoWidget.tsx'
import { maxGitSidebarWidth, minGitSidebarWidth, parseGitDiff } from './git-sidebar.ts'

export type RightWidget = 'git' | 'todo'

export interface RailAction {
  key: string
  icon: ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}

/** Coordonne les panneaux latéraux, leur rail commun et le redimensionnement. */
export function RightSidebar({ activeWidget, onResize, snapshot, width, workspacePath, railActions, onAction, onError, onFileSelect, onRefresh, onRevert, onWidgetSelect }: {
  activeWidget: RightWidget | null
  onResize: (width: number) => void
  snapshot: GitSnapshot | null
  width: number
  workspacePath: string
  railActions: RailAction[]
  onAction: (message: string) => Promise<GitActionResult>
  onError: (cause: unknown) => void
  onFileSelect: (path: string, commitHash?: string) => Promise<GitFileDiff>
  onRefresh: () => void
  onRevert: (hash: string) => Promise<GitRevertResult>
  onWidgetSelect: (widget: RightWidget) => void
}) {
  const [message, setMessage] = useState('')
  const [todoOpenCount, setTodoOpenCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileDiff, setFileDiff] = useState<GitFileDiff | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const hasChanges = snapshot?.files.length ? snapshot.files.length > 0 : false
  const collapsed = activeWidget === null

  /** Charge le diff demandé avant de remplacer la liste de fichiers du widget. */
  async function selectFile(path: string, commitHash?: string): Promise<void> {
    setSelectedPath(path)
    try {
      setFileDiff(await onFileSelect(path, commitHash))
    } catch (cause) {
      setSelectedPath(null)
      onError(cause)
    }
  }

  /** Exécute l'action Git demandée et conserve le message si elle échoue. */
  async function action(): Promise<void> {
    setBusy(true)
    try {
      const result = await onAction(message)
      if (result.committed) setMessage('')
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  /** Revert le commit choisi après confirmation et laisse Git signaler les éventuels conflits. */
  async function revertCommit(hash: string): Promise<void> {
    if (!window.confirm(`Revert le commit ${hash.slice(0, 7)} ?`)) return
    setBusy(true)
    try {
      await onRevert(hash)
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  /** Installe les écouteurs temporaires nécessaires au redimensionnement pointer du panneau. */
  function startResize(event: ReactPointerEvent<HTMLDivElement>): void {
    const handle = event.currentTarget
    const initialX = event.clientX
    const initialWidth = width
    handle.setPointerCapture(event.pointerId)

    const resize = (moveEvent: PointerEvent): void => onResize(initialWidth + initialX - moveEvent.clientX)
    const stop = (): void => {
      handle.removeEventListener('pointermove', resize)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
      handle.removeEventListener('lostpointercapture', stop)
    }

    handle.addEventListener('pointermove', resize)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
    handle.addEventListener('lostpointercapture', stop)
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const adjustment = event.key === 'ArrowLeft' ? 16 : event.key === 'ArrowRight' ? -16 : 0
    if (adjustment) {
      event.preventDefault()
      onResize(width + adjustment)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      onResize(minGitSidebarWidth)
    }
    if (event.key === 'End') {
      event.preventDefault()
      onResize(maxGitSidebarWidth)
    }
  }

  return <aside className="git-sidebar" aria-label="Outils du workspace">
    {!collapsed && <div className="git-widget-panel">
      <div
        aria-controls={activeWidget ? `${activeWidget}-panel` : undefined}
        aria-label="Redimensionner le panneau latéral"
        aria-orientation="vertical"
        aria-valuemax={maxGitSidebarWidth}
        aria-valuemin={minGitSidebarWidth}
        aria-valuenow={width}
        className="git-resize-handle"
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
        role="separator"
        tabIndex={0}
      />
      <section aria-label={activeWidget === 'todo' ? 'Tâches du workspace' : fileDiff || selectedPath ? 'Diff Git' : 'Informations Git'} className="git-panel" id={`${activeWidget}-panel`}>
        {activeWidget === 'git' && snapshot && <WidgetLayout
          footer={activeWidget === 'git' && !selectedPath && (hasChanges || snapshot.ahead > 0) && <form className="git-actions" onSubmit={(event) => { event.preventDefault(); void action() }}>
            {hasChanges && <input aria-label="Message de commit" disabled={busy} onChange={(event) => setMessage(event.target.value)} placeholder="Message de commit" value={message} />}
            <button disabled={busy || (hasChanges && !message.trim())} type="submit">{busy ? 'Git en cours…' : hasChanges ? 'Committer et pousser' : `Pousser ${snapshot.ahead} commit${snapshot.ahead > 1 ? 's' : ''}`}</button>
          </form>}
          header={fileDiff || selectedPath ? <><button aria-label="Retour aux fichiers Git" className="git-back" onClick={() => { setFileDiff(null); setSelectedPath(null) }} title="Retour" type="button">←</button><strong title={selectedPath ?? undefined}>{selectedPath}</strong></> : <><div><strong>{snapshot.branch}</strong><span>{hasChanges ? `${snapshot.files.length} fichier${snapshot.files.length > 1 ? 's' : ''} modifié${snapshot.files.length > 1 ? 's' : ''}` : 'Arbre propre'}</span></div><button aria-label="Actualiser l’état Git" className="git-refresh" onClick={onRefresh} title="Actualiser" type="button">↻</button></>}
        >
          {fileDiff || selectedPath ? fileDiff ? <GitDiff diff={fileDiff.diff} /> : <p className="git-empty">Chargement du diff…</p> : <>
            {hasChanges && <ul className="git-file-list">
              {snapshot.files.map((file) => <li className="git-file-item" key={file.path}>
                {file.status === 'added' || file.status === 'modified' ? <button className="git-file-button" onClick={() => void selectFile(file.path)} type="button"><GitFileRow file={file} /></button> : <GitFileRow file={file} />}
              </li>)}
            </ul>}
            {snapshot.commits.length > 0 && <section className="git-commits" aria-label="Commits non poussés">
              <h2>Commits non poussés <small>{snapshot.commits.length}</small></h2>
              {snapshot.commits.map((commit) => <div className="git-commit" key={commit.hash}>
                <details>
                  <summary title={commit.subject}><code>{commit.hash.slice(0, 7)}</code><span>{commit.subject}</span></summary>
                  {commit.files.length > 0 ? <ul className="git-file-list git-commit-files">{commit.files.map((file) => <li className="git-file-item" key={file.path}>
                    {file.status === 'added' || file.status === 'modified' ? <button className="git-file-button" onClick={() => void selectFile(file.path, commit.hash)} type="button"><GitFileRow file={file} /></button> : <GitFileRow file={file} />}
                  </li>)}</ul> : <p className="git-empty">Aucun fichier modifié.</p>}
                </details>
                <button aria-label={`Revert le commit ${commit.hash.slice(0, 7)}`} className="git-revert" disabled={busy} onClick={() => void revertCommit(commit.hash)} title="Revert ce commit" type="button">↶</button>
              </div>)}
            </section>}
            {!hasChanges && snapshot.ahead === 0 && <p className="git-empty">Aucun changement à committer.</p>}
          </>}
        </WidgetLayout>}
        {activeWidget === 'todo' && <TodoWidget onOpenCountChange={setTodoOpenCount} workspacePath={workspacePath} />}
      </section>
    </div>}
    <div className="git-rail">
      {snapshot && <button
        aria-controls={activeWidget === 'git' ? 'git-panel' : undefined}
        aria-expanded={activeWidget === 'git'}
        aria-label={activeWidget === 'git' ? 'Réduire le panneau Git' : 'Développer le panneau Git'}
        className="rail-tab"
        onClick={() => onWidgetSelect('git')}
        title="Git"
        type="button"
      >
        <span aria-hidden="true">⎇</span>
        {(hasChanges || snapshot.ahead > 0) && <small>{snapshot.files.length + snapshot.ahead}</small>}
      </button>}
      <button
        aria-controls={activeWidget === 'todo' ? 'todo-panel' : undefined}
        aria-expanded={activeWidget === 'todo'}
        aria-label={activeWidget === 'todo' ? 'Réduire le panneau des tâches' : 'Développer le panneau des tâches'}
        className="rail-tab"
        onClick={() => onWidgetSelect('todo')}
        title="À faire"
        type="button"
      >
        <span aria-hidden="true">☑</span>
        {todoOpenCount !== null && todoOpenCount > 0 && <small>{todoOpenCount}</small>}
      </button>
      {railActions.map((action) => <button
        aria-label={action.label}
        className="rail-tab"
        disabled={action.disabled}
        key={action.key}
        onClick={action.onClick}
        title={action.label}
        type="button"
      >{action.icon}</button>)}
    </div>
  </aside>
}

/** Garantit une structure stable : en-tête et actions fixes, contenu seul défilant. */
function WidgetLayout({ children, footer, header }: { children: ReactNode; footer?: ReactNode | false; header: ReactNode }) {
  return <>
    <header className="widget-header">{header}</header>
    <div className="widget-content">{children}</div>
    {footer && <footer className="widget-footer">{footer}</footer>}
  </>
}

/** Affiche les métadonnées communes d'un fichier dans les listes Git. */
function GitFileRow({ file }: { file: GitSnapshot['files'][number] }) {
  return <>
    <span className={`git-file-status ${file.status}`} title={gitStatusLabel(file.status)}>{gitStatusInitial(file.status)}</span>
    <span className="git-file-path" title={file.path}>{file.path}</span>
    <span className="git-file-counts"><b>+{file.additions ?? '—'}</b><i>−{file.deletions ?? '—'}</i></span>
  </>
}

/** Affiche un diff Git avec les numéros de lignes avant et après la modification. */
function GitDiff({ diff }: { diff: string }) {
  const lines = parseGitDiff(diff)
  if (lines.length === 0) return <p className="git-empty">Aucune différence textuelle à afficher.</p>

  return <section className="git-diff" aria-label="Diff du fichier">
    {lines.map((line, index) => <div className={`git-diff-line ${line.kind}`} key={index}>
      <span>{line.oldLine ?? ''}</span>
      <span>{line.newLine ?? ''}</span>
      <i aria-hidden="true">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</i>
      <code>{line.content}</code>
    </div>)}
  </section>
}

function gitStatusLabel(status: 'added' | 'deleted' | 'modified' | 'renamed'): string {
  return { added: 'Ajouté', deleted: 'Supprimé', modified: 'Modifié', renamed: 'Renommé' }[status]
}

function gitStatusInitial(status: 'added' | 'deleted' | 'modified' | 'renamed'): string {
  return { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' }[status]
}
