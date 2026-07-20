import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTurnCost, messageUsage } from '../src/message-usage.ts'

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

test('hides metrics when Pi does not provide complete usage', () => {
  assert.equal(messageUsage({ role: 'assistant', usage: { input: 10 } }), null)
})
