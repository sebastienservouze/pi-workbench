import type { SessionSummary } from '../../../shared/types.ts'
import { isAgentSelector, isBlockingDialog } from '../dialogs/dialog-protocol.ts'

export type SessionIndicator = 'working' | 'waiting' | 'complete'

/** Returns the single highest-priority state worth surfacing beside a session. */
export function sessionIndicator(session: SessionSummary | undefined, selectedId: string, completedSessionIds: ReadonlySet<string>): SessionIndicator | null {
  if (!session) return null
  if (session.pendingUi.some((request) => isBlockingDialog(request) && !isAgentSelector(request))) return 'waiting'
  if (session.status === 'running') return 'working'
  if (session.status === 'idle' && session.id !== selectedId && completedSessionIds.has(session.id)) return 'complete'
  return null
}
