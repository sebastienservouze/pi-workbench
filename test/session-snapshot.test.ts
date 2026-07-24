import assert from 'node:assert/strict'
import test from 'node:test'
import { visibleSessionMessages } from '../server/session-snapshot.ts'

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
