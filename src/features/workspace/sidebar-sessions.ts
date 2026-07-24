import type { RecentSession, SessionSummary } from '../../../shared/types.ts'

/** Adds active sessions that Pi has not written to disk yet to persisted sessions. */
export function sidebarSessions(recentSessions: RecentSession[], sessions: SessionSummary[], workspacePath: string, now = Date.now()): RecentSession[] {
  const recentPaths = new Set(recentSessions.map(({ sessionPath }) => sessionPath))
  const activeSessions = sessions
    .filter(({ cwd, sessionPath, status }) => cwd === workspacePath && sessionPath && status !== 'exited' && !recentPaths.has(sessionPath))
    .map(({ id, cwd, name, sessionPath }) => ({ id, cwd, name, sessionPath: sessionPath!, updatedAt: now }))

  return [...activeSessions, ...recentSessions]
}
