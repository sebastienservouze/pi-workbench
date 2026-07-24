import assert from 'node:assert/strict'
import test from 'node:test'
import type { SessionSummary } from '../shared/types.ts'
import { sessionIndicator } from '../src/features/workspace/session-indicator.ts'

const session: SessionSummary = {
  id: 'session-1',
  cwd: '/workspace',
  name: 'Session',
  status: 'running',
  pendingUi: [],
}

test('prioritizes attention and clears completed sessions when they are consulted', () => {
  const completed = new Set([session.id])

  assert.equal(sessionIndicator(session, '', completed), 'working')
  assert.equal(sessionIndicator({ ...session, pendingUi: [{ method: 'confirm' }] }, '', completed), 'waiting')
  assert.equal(sessionIndicator({ ...session, status: 'idle' }, '', completed), 'complete')
  assert.equal(sessionIndicator({ ...session, status: 'idle' }, session.id, completed), null)
})
