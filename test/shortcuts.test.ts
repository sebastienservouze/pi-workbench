import assert from 'node:assert/strict'
import test from 'node:test'
import { commandDefinitions, defaultShortcuts, lastAssistantText, rightWidgetCommandId, rightWidgetFromCommand, shortcutConflicts, shortcutFromEvent } from '../src/features/commands/command-registry.ts'
import { rightWidgetDefinitions } from '../src/features/right-sidebar/right-sidebar.ts'

test('normalise un raccourci clavier', () => {
  assert.equal(shortcutFromEvent({ key: 'K', ctrlKey: true }), 'mod+k')
  assert.equal(defaultShortcuts['open-palette'], 'mod+k')
})

test('expose automatiquement chaque widget dans le registre de commandes', () => {
  for (const widget of rightWidgetDefinitions) {
    const commandId = rightWidgetCommandId(widget.id)
    assert.equal(rightWidgetFromCommand(commandId), widget.id)
    assert.ok(commandDefinitions.some(({ id, label }) => id === commandId && label === `Open ${widget.label}`))
  }
})

test('détecte les conflits de raccourcis', () => {
  const conflicts = shortcutConflicts({ send: 'mod+k', abort: 'mod+k' })
  assert.deepEqual([...conflicts].sort(), ['abort', 'send'])
})

test('extrait la dernière réponse assistant', () => {
  assert.equal(lastAssistantText([{ role: 'assistant', content: 'Première' }, { role: 'assistant', content: [{ type: 'text', text: 'Dernière' }] }]), 'Dernière')
})
