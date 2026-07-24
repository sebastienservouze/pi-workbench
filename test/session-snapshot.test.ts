import assert from 'node:assert/strict'
import test from 'node:test'
import { activeSessionMessages, visibleSessionMessages } from '../server/session-snapshot.ts'

test('keeps the active conversation before and after compaction', () => {
  const messages = activeSessionMessages([
    { type: 'message', id: 'user-1', parentId: null, message: { role: 'user', content: 'Original request' } },
    { type: 'message', id: 'assistant-1', parentId: 'user-1', message: { role: 'assistant', content: 'Original response' } },
    { type: 'message', id: 'abandoned', parentId: 'user-1', message: { role: 'assistant', content: 'Abandoned branch' } },
    { type: 'compaction', id: 'compact-1', parentId: 'assistant-1', summary: 'Summary' },
    { type: 'message', id: 'user-2', parentId: 'compact-1', message: { role: 'user', content: 'Continue' } },
  ], 'user-2')

  assert.deepEqual(messages, [
    { role: 'user', content: 'Original request' },
    { role: 'assistant', content: 'Original response' },
    { role: 'user', content: 'Continue' },
  ])
})

test('keeps visible custom messages out of hidden extension context', () => {
  const visible = { role: 'custom', customType: 'status', content: 'Prêt', display: true }
  const hidden = { role: 'custom', customType: 'secret-context', content: 'Interne', display: false }

  assert.deepEqual(visibleSessionMessages([
    { role: 'user', content: 'Bonjour' },
    visible,
    hidden,
    { role: 'custom', content: 'Type manquant', display: true },
    { role: 'branchSummary', summary: 'Résumé' },
  ]), [
    { role: 'user', content: 'Bonjour' },
    visible,
  ])
})
