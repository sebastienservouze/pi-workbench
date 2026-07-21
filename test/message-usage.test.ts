import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTurnCost, messageUsage, turnUsageByMessage } from '../src/features/conversation/message-usage.ts'

test('extracts per-response cost and token counters from Pi usage', () => {
  const usage = messageUsage({
    role: 'assistant',
    usage: {
      input: 12_345,
      output: 678,
      cacheRead: 9_876,
      cost: { total: 0.00105 },
    },
  })

  assert.deepEqual(usage, { cacheMiss: 12_345, cacheRead: 9_876, cost: 0.00105, output: 678 })
  assert.equal(formatTurnCost(usage?.cost ?? 0), '$0.0011')
})

test('aggregates every assistant response in a user turn', () => {
  const usages = turnUsageByMessage([
    { role: 'user', content: 'Inspecte le dépôt.' },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'call_1', name: 'read' }], usage: { input: 100, output: 10, cacheRead: 1_000, cost: { total: 0.001 } } },
    { role: 'toolResult', toolCallId: 'call_1' },
    { role: 'assistant', content: [{ type: 'text', text: 'C’est fait.' }], usage: { input: 200, output: 20, cacheRead: 2_000, cost: { total: 0.002 } } },
    { role: 'user', content: 'Autre tour.' },
    { role: 'assistant', content: [{ type: 'text', text: 'Réponse.' }], usage: { input: 400, output: 40, cacheRead: 4_000, cost: { total: 0.004 } } },
  ])

  assert.deepEqual([...usages], [
    [3, { cacheMiss: 300, cacheRead: 3_000, cost: 0.003, output: 30 }],
    [5, { cacheMiss: 400, cacheRead: 4_000, cost: 0.004, output: 40 }],
  ])
})

test('hides metrics when Pi does not provide complete usage', () => {
  assert.equal(messageUsage({ role: 'assistant', usage: { input: 10 } }), null)
  assert.deepEqual(turnUsageByMessage([
    { role: 'user' },
    { role: 'assistant', usage: { input: 10 } },
  ]), new Map())
})
