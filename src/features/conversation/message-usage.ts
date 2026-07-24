import type { JsonObject } from '../../../shared/types.ts'

export interface MessageUsage {
  cacheMiss: number
  cacheRead: number
  cacheWrite: number
  cost: number
  output: number
}

/** Extracts final counters associated with a Pi response or tool result. */
export function messageUsage(message: JsonObject): MessageUsage | null {
  const usage = isObject(message.usage) ? message.usage : null
  const cost = usage && isObject(usage.cost) ? usage.cost : null
  if (!usage || !cost || !isNumber(usage.input) || !isNumber(usage.cacheRead) || !isNumber(usage.output) || !isNumber(cost.total)) return null
  return { cacheMiss: usage.input, cacheRead: usage.cacheRead, cacheWrite: isNumber(usage.cacheWrite) ? usage.cacheWrite : 0, cost: cost.total, output: usage.output }
}

export function formatTurnCost(value: number): string {
  const digits = value < 0.01 ? 4 : 2
  return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}`
}

export function formatTokens(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
}

/** Associates each agent turn with the billed counters from its assistant response. */
export function turnUsageByMessage(messages: JsonObject[]): Map<number, MessageUsage> {
  return new Map(messages.flatMap((message, index) => {
    const usage = message.role === 'assistant' ? messageUsage(message) : null
    return usage ? [[index, usage] as const] : []
  }))
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
