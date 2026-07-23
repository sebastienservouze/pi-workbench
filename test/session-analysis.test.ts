import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeSession } from '../src/features/session-analysis/session-analysis.ts'

const usage = (input: number, output: number, cacheRead: number, cacheWrite: number, cost: number) => ({
  input,
  output,
  cacheRead,
  cacheWrite,
  cost: { total: cost },
})

test('reconstruit les requêtes multi-appels et calcule les statistiques par réponse assistant', () => {
  const messages = [
    { role: 'user', timestamp: 100, content: 'Analyse le dépôt.' },
    {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'src/App.tsx' } }],
      usage: usage(100, 10, 1_000, 20, 0.01),
    },
    { role: 'toolResult', toolCallId: 'call_1', toolName: 'read', content: [{ type: 'text', text: 'contenu' }], isError: false },
    { role: 'assistant', content: [{ type: 'text', text: 'Première réponse.' }], usage: usage(200, 20, 2_000, 30, 0.02) },
    { role: 'user', timestamp: 200, content: 'Continue.' },
    { role: 'assistant', content: [{ type: 'text', text: 'En cours.' }], usage: usage(300, 30, 3_000, 40, 0.03) },
  ]
  const analysis = analyzeSession(messages, {
    cost: 0.07,
    toolCalls: 1,
    tokens: { input: 600, output: 60, cacheRead: 6_000, cacheWrite: 90 },
    contextUsage: { percent: 42.5 },
  }, true, { requestDurations: new Map([[100, 1_250]]) })

  assert.equal(analysis.requests.length, 2)
  assert.deepEqual(analysis.requests.map(({ cost, modelCallCount, complete }) => ({ cost, modelCallCount, complete })), [
    { cost: 0.03, modelCallCount: 2, complete: true },
    { cost: 0.03, modelCallCount: 1, complete: false },
  ])
  assert.equal(analysis.requests[0]?.durationMs, 1_250)
  assert.equal(analysis.averageTurnCost, 0.02)
  assert.equal(analysis.medianTurnCost, 0.02)
  assert.equal(analysis.turnCount, 3)
  assert.equal(analysis.averageToolCallsPerTurn, 1 / 3)
  assert.deepEqual(analysis.turns, [
    { messageIndex: 1, number: 1, cost: 0.01, toolCallCount: 1 },
    { messageIndex: 3, number: 2, cost: 0.02, toolCallCount: 0 },
    { messageIndex: 5, number: 3, cost: 0.03, toolCallCount: 0 },
  ])
  assert.ok(Math.abs(analysis.unattributedCost - 0.01) < Number.EPSILON)
  assert.deepEqual(analysis.tokens, { cacheMiss: 600, cacheRead: 6_000, cacheWrite: 90, cost: 0.07, output: 60 })
  assert.equal(analysis.costAvailable, true)
  assert.equal(analysis.attributionAvailable, true)
  assert.equal(analysis.tokensAvailable, true)
  assert.equal(analysis.contextPercent, 42.5)
})

test('compte uniquement les erreurs explicites et déduplique la télémétrie live', () => {
  const messages = [
    { role: 'user', timestamp: 100, content: 'Lance les outils.' },
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'call_failed', name: 'bash', arguments: { command: 'false' } },
        { type: 'toolCall', id: 'call_text', name: 'read', arguments: { path: 'missing' } },
      ],
      usage: usage(10, 5, 20, 0, 0.001),
    },
    { role: 'toolResult', toolCallId: 'call_failed', toolName: 'bash', content: [{ type: 'text', text: 'failed' }], isError: true },
    { role: 'toolResult', toolCallId: 'call_text', toolName: 'read', content: [{ type: 'text', text: 'error in ordinary output' }], isError: false },
  ]
  const analysis = analyzeSession(messages, null, false, {
    toolDurations: new Map([['call_failed', 250], ['call_live', 500]]),
    toolExecutions: [
      { id: 'call_failed', name: 'bash', args: { command: 'false' }, status: 'running', result: { toolCallId: 'call_failed', toolName: 'bash', content: 'failed', isError: true } },
      { id: 'call_live', name: 'grep', args: { pattern: 'x' }, status: 'running' },
    ],
  })

  assert.equal(analysis.totalToolCalls, 3)
  assert.equal(analysis.failedToolCalls, 1)
  assert.deepEqual(analysis.toolCalls.map(({ id, pending }) => ({ id, pending })), [
    { id: 'call_failed', pending: false },
    { id: 'call_text', pending: false },
    { id: 'call_live', pending: true },
  ])
  assert.equal(analysis.toolCalls.find((call) => call.id === 'call_failed')?.durationMs, 250)
  assert.equal(analysis.toolCalls.find((call) => call.id === 'call_live')?.durationMs, 500)
})

test('cumule les volumes et durées par type d’outil', () => {
  const messages = [
    { role: 'user', content: 'Lis les fichiers.' },
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'read_1', name: 'read', arguments: { path: 'a' } },
        { type: 'toolCall', id: 'read_2', name: 'read', arguments: { path: 'b' } },
      ],
      usage: usage(10, 5, 20, 0, 0.001),
    },
    { role: 'toolResult', toolCallId: 'read_1', toolName: 'read', content: [{ type: 'text', text: 'abc' }], isError: false },
    { role: 'toolResult', toolCallId: 'read_2', toolName: 'read', content: [{ type: 'text', text: 'hello' }], isError: true },
  ]
  const analysis = analyzeSession(messages, null, false, {
    toolDurations: new Map([['read_1', 100], ['read_2', 250]]),
  })

  assert.deepEqual(analysis.tools, [{
    name: 'read',
    count: 2,
    failed: 1,
    outputLength: 8,
    durationMs: 350,
    measuredDurationCount: 2,
  }])
})

test('rattache une exécution live orpheline à une requête navigable de secours', () => {
  const analysis = analyzeSession([], null, true, {
    toolExecutions: [{ id: 'call_live', name: 'read', args: {}, status: 'running' }],
  })

  assert.equal(analysis.requests[0]?.messageIndex, -1)
  assert.equal(analysis.requests[0]?.complete, false)
  assert.equal(analysis.costAvailable, false)
  assert.equal(analysis.attributionAvailable, false)
  assert.equal(analysis.turnCount, 0)
  assert.equal(analysis.averageToolCallsPerTurn, 0)
  assert.equal(analysis.tokensAvailable, false)
  assert.equal(analysis.toolCalls[0]?.requestMessageIndex, -1)
})
