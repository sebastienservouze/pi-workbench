import { useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { GitActionResult, GitFileDiff, GitRevertResult, GitSnapshot, QuotaSnapshot } from '../../../shared/types.ts'
import { QuotaWidget } from '../quotas/QuotaWidget.tsx'
import { railQuota, type QuotaProvider } from '../quotas/quota-display.ts'
import { SessionAnalysisWidget } from '../session-analysis/SessionAnalysisWidget.tsx'
import type { SessionAnalysis, SessionAnalysisTarget } from '../session-analysis/session-analysis.ts'
import { TerminalWidget } from '../terminal/TerminalWidget.tsx'
import { TodoWidget } from '../todo/TodoWidget.tsx'
import { maxGitSidebarWidth, minGitSidebarWidth, parseGitDiff } from './git-sidebar.ts'

export type RightWidget = 'analysis' | 'git' | 'quotas' | 'terminal' | 'todo'

export interface RailAction {
  key: string
  icon: ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}

/** Coordinates the sidebar panels, their common rail, and resizing. */
export function RightSidebar({ activeWidget, analysis, currentQuotaProvider, onAnalysisNavigate, onResize, snapshot, quotas, width, workspacePath, railActions, onAction, onError, onFileSelect, onQuotaRefresh, onRefresh, onRevert, onTodoStartSession, onWidgetSelect }: {
  activeWidget: RightWidget | null
  analysis: SessionAnalysis | null
  currentQuotaProvider: QuotaProvider | undefined
  onAnalysisNavigate: (target: SessionAnalysisTarget) => void
  onResize: (width: number) => void
  snapshot: GitSnapshot | null
  quotas: QuotaSnapshot | null
  width: number
  workspacePath: string
  railActions: RailAction[]
  onAction: (message: string) => Promise<GitActionResult>
  onError: (cause: unknown) => void
  onFileSelect: (path: string, commitHash?: string) => Promise<GitFileDiff>
  onQuotaRefresh: () => Promise<void>
  onRefresh: () => void
  onRevert: (hash: string) => Promise<GitRevertResult>
  onTodoStartSession: (message: string) => Promise<void>
  onWidgetSelect: (widget: RightWidget) => void
}) {
  const [message, setMessage] = useState('')
  const [todoOpenCount, setTodoOpenCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileDiff, setFileDiff] = useState<GitFileDiff | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const hasChanges = snapshot?.files.length ? snapshot.files.length > 0 : false
  const collapsed = activeWidget === null || (activeWidget === 'analysis' && !analysis) || (activeWidget === 'git' && !snapshot)
  const quotaSummary = railQuota(quotas, currentQuotaProvider)

  /** Loads the requested diff before replacing the widget's file list. */
  async function selectFile(path: string, commitHash?: string): Promise<void> {
    setSelectedPath(path)
    try {
      setFileDiff(await onFileSelect(path, commitHash))
    } catch (cause) {
      setSelectedPath(null)
      onError(cause)
    }
  }

  /** Executes the requested Git action and preserves the message if it fails. */
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

  /** Reverts the chosen commit after confirmation and lets Git report conflicts. */
  async function revertCommit(hash: string): Promise<void> {
    if (!window.confirm(`Revert commit ${hash.slice(0, 7)}?`)) return
    setBusy(true)
    try {
      await onRevert(hash)
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  /** Installs temporary listeners needed for panel pointer resizing. */
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

  return <aside className="git-sidebar" aria-label="Workspace tools">
    {!collapsed && <div className="git-widget-panel">
      <div
        aria-controls={activeWidget ? `${activeWidget}-panel` : undefined}
        aria-label="Resize sidebar panel"
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
      <section aria-label={activeWidget === 'analysis' ? 'Session analysis' : activeWidget === 'todo' ? 'Workspace tasks' : activeWidget === 'terminal' ? 'Workspace terminal' : activeWidget === 'quotas' ? 'Provider quotas' : fileDiff || selectedPath ? 'Git diff' : 'Git information'} className="git-panel" id={`${activeWidget}-panel`}>
        {activeWidget === 'analysis' && analysis && <WidgetLayout header={<div><strong>Session analysis</strong><span>{analysis.requests.length} request{analysis.requests.length > 1 ? 's' : ''} analyzed</span></div>}><SessionAnalysisWidget analysis={analysis} onNavigate={onAnalysisNavigate} /></WidgetLayout>}
        {activeWidget === 'git' && snapshot && <WidgetLayout
          footer={activeWidget === 'git' && !selectedPath && (hasChanges || snapshot.ahead > 0) && <form className="git-actions" onSubmit={(event) => { event.preventDefault(); void action() }}>
            {hasChanges && <input aria-label="Commit message" disabled={busy} onChange={(event) => setMessage(event.target.value)} placeholder="Commit message" value={message} />}
            <button disabled={busy || (hasChanges && !message.trim())} type="submit">{busy ? 'Git in progress…' : hasChanges ? 'Commit & push' : `Push ${snapshot.ahead} commit${snapshot.ahead > 1 ? 's' : ''}`}</button>
          </form>}
          header={fileDiff || selectedPath ? <><button aria-label="Back to Git files" className="git-back" onClick={() => { setFileDiff(null); setSelectedPath(null) }} title="Back" type="button">←</button><strong title={selectedPath ?? undefined}>{selectedPath}</strong></> : <><div><strong>{snapshot.branch}</strong><span>{hasChanges ? `${snapshot.files.length} file${snapshot.files.length > 1 ? 's' : ''} modified` : 'Clean tree'}</span></div><button aria-label="Refresh Git state" className="git-refresh" onClick={onRefresh} title="Refresh" type="button">↻</button></>}
        >
          {fileDiff || selectedPath ? fileDiff ? <GitDiff diff={fileDiff.diff} /> : <p className="git-empty">Loading diff…</p> : <>
            {hasChanges && <ul className="git-file-list">
              {snapshot.files.map((file) => <li className="git-file-item" key={file.path}>
                {file.status === 'added' || file.status === 'modified' ? <button className="git-file-button" onClick={() => void selectFile(file.path)} type="button"><GitFileRow file={file} /></button> : <GitFileRow file={file} />}
              </li>)}
            </ul>}
            {snapshot.commits.length > 0 && <section className="git-commits" aria-label="Unpushed commits">
              <h2>Unpushed commits <small>{snapshot.commits.length}</small></h2>
              {snapshot.commits.map((commit) => <div className="git-commit" key={commit.hash}>
                <details>
                  <summary title={commit.subject}><code>{commit.hash.slice(0, 7)}</code><span>{commit.subject}</span></summary>
                  {commit.files.length > 0 ? <ul className="git-file-list git-commit-files">{commit.files.map((file) => <li className="git-file-item" key={file.path}>
                    {file.status === 'added' || file.status === 'modified' ? <button className="git-file-button" onClick={() => void selectFile(file.path, commit.hash)} type="button"><GitFileRow file={file} /></button> : <GitFileRow file={file} />}
                  </li>)}</ul> : <p className="git-empty">No files modified.</p>}
                </details>
                <button aria-label={`Revert commit ${commit.hash.slice(0, 7)}`} className="git-revert" disabled={busy} onClick={() => void revertCommit(commit.hash)} title="Revert this commit" type="button">↶</button>
              </div>)}
            </section>}
            {!hasChanges && snapshot.ahead === 0 && <p className="git-empty">No changes to commit.</p>}
          </>}
        </WidgetLayout>}
        {activeWidget === 'quotas' && <QuotaWidget onRefresh={onQuotaRefresh} quotas={quotas} />}
        {activeWidget === 'terminal' && <TerminalWidget workspacePath={workspacePath} />}
        {activeWidget === 'todo' && <TodoWidget onOpenCountChange={setTodoOpenCount} onStartSession={onTodoStartSession} workspacePath={workspacePath} />}
      </section>
    </div>}
    <div className="git-rail">
      {analysis && <button
        aria-controls={activeWidget === 'analysis' ? 'analysis-panel' : undefined}
        aria-expanded={activeWidget === 'analysis'}
        aria-label={activeWidget === 'analysis' ? 'Collapse session analysis' : 'Expand session analysis'}
        className="rail-tab"
        onClick={() => onWidgetSelect('analysis')}
        title="Session analysis"
        type="button"
      >
        <span aria-hidden="true">∑</span>
        {analysis.failedToolCalls > 0 && <small>{analysis.failedToolCalls}</small>}
      </button>}
      {snapshot && <button
        aria-controls={activeWidget === 'git' ? 'git-panel' : undefined}
        aria-expanded={activeWidget === 'git'}
        aria-label={activeWidget === 'git' ? 'Collapse Git panel' : 'Expand Git panel'}
        className="rail-tab"
        onClick={() => onWidgetSelect('git')}
        title="Git"
        type="button"
      >
        <span aria-hidden="true">⎇</span>
        {(hasChanges || snapshot.ahead > 0) && <small>{snapshot.files.length + snapshot.ahead}</small>}
      </button>}
      <button
        aria-controls={activeWidget === 'quotas' ? 'quotas-panel' : undefined}
        aria-expanded={activeWidget === 'quotas'}
        aria-label={`${activeWidget === 'quotas' ? 'Collapse' : 'Expand'} quota panel${quotaSummary ? `. ${quotaSummary.label}` : ''}`}
        className="rail-tab"
        onClick={() => onWidgetSelect('quotas')}
        title={quotaSummary?.label ?? 'Quotas'}
        type="button"
      >
        <span aria-hidden="true" className="quota-rail-value">{quotaSummary?.value ?? '%'}</span>
        {quotaSummary?.stale && <small>!</small>}
      </button>
      <button
        aria-controls={activeWidget === 'terminal' ? 'terminal-panel' : undefined}
        aria-expanded={activeWidget === 'terminal'}
        aria-label={activeWidget === 'terminal' ? 'Collapse terminal' : 'Expand terminal'}
        className="rail-tab"
        onClick={() => onWidgetSelect('terminal')}
        title="Terminal"
        type="button"
      >
        <span aria-hidden="true">›_</span>
      </button>
      <button
        aria-controls={activeWidget === 'todo' ? 'todo-panel' : undefined}
        aria-expanded={activeWidget === 'todo'}
        aria-label={activeWidget === 'todo' ? 'Collapse the task panel' : 'Expand the task panel'}
        className="rail-tab"
        onClick={() => onWidgetSelect('todo')}
        title="Todo"
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

/** Keeps a stable structure with fixed header and actions and scrolling content only. */
function WidgetLayout({ children, footer, header }: { children: ReactNode; footer?: ReactNode | false; header: ReactNode }) {
  return <>
    <header className="widget-header">{header}</header>
    <div className="widget-content">{children}</div>
    {footer && <footer className="widget-footer">{footer}</footer>}
  </>
}

/** Displays common file metadata in Git lists. */
function GitFileRow({ file }: { file: GitSnapshot['files'][number] }) {
  return <>
    <span className={`git-file-status ${file.status}`} title={gitStatusLabel(file.status)}>{gitStatusInitial(file.status)}</span>
    <span className="git-file-path" title={file.path}>{file.path}</span>
    <span className="git-file-counts"><b>+{file.additions ?? '—'}</b><i>−{file.deletions ?? '—'}</i></span>
  </>
}

/** Displays a Git diff with line numbers before and after the change. */
function GitDiff({ diff }: { diff: string }) {
  const lines = parseGitDiff(diff)
  if (lines.length === 0) return <p className="git-empty">No textual differences to display.</p>

  return <section className="git-diff" aria-label="File diff">
    {lines.map((line, index) => <div className={`git-diff-line ${line.kind}`} key={index}>
      <span>{line.oldLine ?? ''}</span>
      <span>{line.newLine ?? ''}</span>
      <i aria-hidden="true">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</i>
      <code>{line.content}</code>
    </div>)}
  </section>
}

function gitStatusLabel(status: 'added' | 'deleted' | 'modified' | 'renamed'): string {
  return { added: 'Added', deleted: 'Deleted', modified: 'Modified', renamed: 'Renamed' }[status]
}

function gitStatusInitial(status: 'added' | 'deleted' | 'modified' | 'renamed'): string {
  return { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' }[status]
}
