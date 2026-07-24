import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { GitActionResult, GitFileDiff, GitRevertResult, GitSnapshot, QuotaSnapshot } from '../../../shared/types.ts'
import { getTodos } from '../../api.ts'
import { GitWidget } from '../git/GitWidget.tsx'
import { QuotaWidget } from '../quotas/QuotaWidget.tsx'
import { railQuota, type QuotaProvider } from '../quotas/quota-display.ts'
import { SessionAnalysisWidget } from '../session-analysis/SessionAnalysisWidget.tsx'
import type { SessionAnalysis, SessionAnalysisTarget } from '../session-analysis/session-analysis.ts'
import { TerminalWidget } from '../terminal/TerminalWidget.tsx'
import { TodoWidget } from '../todo/TodoWidget.tsx'
import { maxRightSidebarWidth, minRightSidebarWidth, type RightWidget } from './right-sidebar.ts'
import { WidgetLayout } from './WidgetLayout.tsx'

export interface RailAction {
  key: string
  icon: ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}

/** Coordinates the sidebar panels, their common rail, and resizing. */
export function RightSidebar({ activeWidget, analysis, currentQuotaProvider, onAnalysisNavigate, onResize, snapshot, quotas, width, workspacePath, railActions, onAction, onError, onFileSelect, onQuotaRefresh, onRefresh, onRevert, onTodoSendPrompt, onTodoStartSession, onWidgetSelect }: {
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
  onTodoSendPrompt: (message: string) => Promise<void>
  onTodoStartSession: (message: string) => Promise<void>
  onWidgetSelect: (widget: RightWidget) => void
}) {
  const [todoOpenCount, setTodoOpenCount] = useState<number | null>(null)
  const hasChanges = snapshot ? snapshot.files.length > 0 : false

  useEffect(() => {
    let cancelled = false
    setTodoOpenCount(null)
    void getTodos(workspacePath).then((todos) => {
      if (!cancelled) setTodoOpenCount(todos.filter((todo) => !todo.completed).length)
    }).catch(() => {
      if (!cancelled) setTodoOpenCount(null)
    })
    return () => { cancelled = true }
  }, [workspacePath])
  const collapsed = activeWidget === null || (activeWidget === 'analysis' && !analysis) || (activeWidget === 'git' && !snapshot)
  const quotaSummary = railQuota(quotas, currentQuotaProvider)

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
      onResize(minRightSidebarWidth)
    }
    if (event.key === 'End') {
      event.preventDefault()
      onResize(maxRightSidebarWidth)
    }
  }

  return <aside className="right-sidebar" aria-label="Workspace tools">
    {!collapsed && <div className="right-sidebar-panel">
      <div
        aria-controls={activeWidget ? `${activeWidget}-panel` : undefined}
        aria-label="Resize sidebar panel"
        aria-orientation="vertical"
        aria-valuemax={maxRightSidebarWidth}
        aria-valuemin={minRightSidebarWidth}
        aria-valuenow={width}
        className="right-sidebar-resize-handle"
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
        role="separator"
        tabIndex={0}
      />
      <section aria-label={panelLabel(activeWidget)} className="right-sidebar-content" id={`${activeWidget}-panel`}>
        {activeWidget === 'analysis' && analysis && <WidgetLayout header={<div><strong>Session analysis</strong><span>{analysis.requests.length} request{analysis.requests.length > 1 ? 's' : ''} analyzed</span></div>}><SessionAnalysisWidget analysis={analysis} onNavigate={onAnalysisNavigate} /></WidgetLayout>}
        {activeWidget === 'git' && snapshot && <GitWidget onAction={onAction} onError={onError} onFileSelect={onFileSelect} onRefresh={onRefresh} onRevert={onRevert} snapshot={snapshot} />}
        {activeWidget === 'quotas' && <QuotaWidget onRefresh={onQuotaRefresh} quotas={quotas} />}
        {activeWidget === 'terminal' && <TerminalWidget workspacePath={workspacePath} />}
        {activeWidget === 'todo' && <TodoWidget onOpenCountChange={setTodoOpenCount} onSendPrompt={onTodoSendPrompt} onStartSession={onTodoStartSession} workspacePath={workspacePath} />}
      </section>
    </div>}
    <div className="right-sidebar-rail">
      {analysis && <button aria-controls={activeWidget === 'analysis' ? 'analysis-panel' : undefined} aria-expanded={activeWidget === 'analysis'} aria-label={activeWidget === 'analysis' ? 'Collapse session analysis' : 'Expand session analysis'} className="rail-tab" onClick={() => onWidgetSelect('analysis')} title="Session analysis" type="button">
        <span aria-hidden="true">∑</span>
        {analysis.failedToolCalls > 0 && <small>{analysis.failedToolCalls}</small>}
      </button>}
      {snapshot && <button aria-controls={activeWidget === 'git' ? 'git-panel' : undefined} aria-expanded={activeWidget === 'git'} aria-label={activeWidget === 'git' ? 'Collapse Git panel' : 'Expand Git panel'} className="rail-tab" onClick={() => onWidgetSelect('git')} title="Git" type="button">
        <span aria-hidden="true">⎇</span>
        {(hasChanges || snapshot.ahead > 0) && <small>{snapshot.files.length + snapshot.ahead}</small>}
      </button>}
      <button aria-controls={activeWidget === 'quotas' ? 'quotas-panel' : undefined} aria-expanded={activeWidget === 'quotas'} aria-label={`${activeWidget === 'quotas' ? 'Collapse' : 'Expand'} quota panel${quotaSummary ? `. ${quotaSummary.label}` : ''}`} className="rail-tab" onClick={() => onWidgetSelect('quotas')} title={quotaSummary?.label ?? 'Quotas'} type="button">
        <span aria-hidden="true" className="quota-rail-value">{quotaSummary?.value ?? '%'}</span>
        {quotaSummary?.stale && <small>!</small>}
      </button>
      <button aria-controls={activeWidget === 'terminal' ? 'terminal-panel' : undefined} aria-expanded={activeWidget === 'terminal'} aria-label={activeWidget === 'terminal' ? 'Collapse terminal' : 'Expand terminal'} className="rail-tab" onClick={() => onWidgetSelect('terminal')} title="Terminal" type="button"><span aria-hidden="true">›_</span></button>
      <button aria-controls={activeWidget === 'todo' ? 'todo-panel' : undefined} aria-expanded={activeWidget === 'todo'} aria-label={activeWidget === 'todo' ? 'Collapse the task panel' : 'Expand the task panel'} className="rail-tab" onClick={() => onWidgetSelect('todo')} title="Todo" type="button">
        <span aria-hidden="true">☑</span>
        {todoOpenCount !== null && todoOpenCount > 0 && <small aria-label={`${todoOpenCount} tasks remaining`}>{todoOpenCount}</small>}
      </button>
      {railActions.map((action) => <button aria-label={action.label} className="rail-tab" disabled={action.disabled} key={action.key} onClick={action.onClick} title={action.label} type="button">{action.icon}</button>)}
    </div>
  </aside>
}

function panelLabel(activeWidget: RightWidget | null): string {
  return activeWidget === 'analysis' ? 'Session analysis' : activeWidget === 'todo' ? 'Workspace tasks' : activeWidget === 'terminal' ? 'Workspace terminal' : activeWidget === 'quotas' ? 'Provider quotas' : 'Git information'
}
