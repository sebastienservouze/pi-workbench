import assert from 'node:assert/strict'
import test from 'node:test'
import type { RecentSession, SessionSummary } from '../shared/types.ts'
import { sidebarSessions } from '../src/features/workspace/sidebar-sessions.ts'

const activeSession: SessionSummary = {
  id: 'runtime-id',
  cwd: '/workspace',
  name: 'Nouvelle session',
  sessionPath: '/sessions/new.jsonl',
  status: 'idle',
  pendingUi: [],
}

test('shows an active session before it appears in Pi session storage', () => {
  assert.deepEqual(sidebarSessions([], [activeSession], '/workspace', 123), [{
    id: 'runtime-id',
    cwd: '/workspace',
    name: 'Nouvelle session',
    sessionPath: '/sessions/new.jsonl',
    updatedAt: 123,
  }])
})

test('does not duplicate an active session already persisted by Pi', () => {
  const persisted: RecentSession = {
    id: 'persisted-id',
    cwd: '/workspace',
    name: 'Premier message',
    sessionPath: '/sessions/new.jsonl',
    updatedAt: 456,
  }

  assert.deepEqual(sidebarSessions([persisted], [activeSession], '/workspace', 123), [persisted])
})
