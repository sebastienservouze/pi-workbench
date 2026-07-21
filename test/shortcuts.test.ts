import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultShortcuts, lastAssistantText, shortcutConflicts, shortcutFromEvent } from '../src/features/commands/command-registry.ts'

test('normalise un raccourci clavier', () => {
  assert.equal(shortcutFromEvent({ key: 'K', ctrlKey: true }), 'mod+k')
  assert.equal(defaultShortcuts['open-palette'], 'mod+k')
})

test('détecte les conflits de raccourcis', () => {
  const conflicts = shortcutConflicts({ send: 'mod+k', abort: 'mod+k' })
  assert.deepEqual([...conflicts].sort(), ['abort', 'send'])
})

test('extrait la dernière réponse assistant', () => {
  assert.equal(lastAssistantText([{ role: 'assistant', content: 'Première' }, { role: 'assistant', content: [{ type: 'text', text: 'Dernière' }] }]), 'Dernière')
})
