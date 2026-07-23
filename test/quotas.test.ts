import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCopilotUsage, parseOpenAiUsage } from '../shared/quota-parsers.ts'
import { QuotaCache } from '../server/quota-cache.ts'

test('normalizes the Codex five-hour and weekly windows', () => {
  assert.deepEqual(parseOpenAiUsage({
    rate_limit: {
      primary_window: { used_percent: 24.5, reset_at: 1_800_000_000, limit_window_seconds: 18_000 },
      secondary_window: { percent_left: 31, reset_at: 1_900_000_000, limit_window_seconds: 604_800 },
    },
  }), [
    { period: '5h', remainingPercent: 75.5, resetsAt: 1_800_000_000_000 },
    { period: '7d', remainingPercent: 31, resetsAt: 1_900_000_000_000 },
  ])
})

test('keeps only finite monthly Copilot quotas', () => {
  assert.deepEqual(parseCopilotUsage({
    quota_reset_date: '2030-01-01T00:00:00Z',
    quota_snapshots: {
      premium_interactions: { entitlement: 300, remaining: 125, unlimited: false },
      chat: { entitlement: 0, remaining: 0, unlimited: true },
    },
  }), [{ name: 'Interactions premium', used: 175, limit: 300, resetsAt: Date.parse('2030-01-01T00:00:00Z') }])
})

test('retains a stale provider snapshot when its next refresh fails', () => {
  const cache = new QuotaCache()
  cache.receiveManagerEvent(statusEvent({
    protocol: 'pi-workbench.quotas', version: 1, refreshedAt: 100,
    openai: { ok: true, data: [{ period: '5h', remainingPercent: 80 }] },
    copilot: { ok: true, data: [] },
  }))
  cache.receiveManagerEvent(statusEvent({
    protocol: 'pi-workbench.quotas', version: 1, refreshedAt: 200,
    openai: { ok: false, error: 'OpenAI indisponible' },
    copilot: { ok: true, data: [] },
  }))

  assert.deepEqual(cache.snapshot(false).openai, {
    data: [{ period: '5h', remainingPercent: 80 }],
    updatedAt: 100,
    stale: true,
    error: 'OpenAI indisponible',
  })
})

function statusEvent(report: unknown): unknown {
  return {
    event: 'pi',
    data: {
      type: 'extension_ui_request',
      method: 'setStatus',
      statusKey: 'pi-workbench.quotas',
      statusText: JSON.stringify(report),
    },
  }
}
