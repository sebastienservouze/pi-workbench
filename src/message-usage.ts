import type { JsonObject } from '../shared/types.ts'

export interface MessageUsage {
  cacheMiss: number
  cacheRead: number
  cost: number
  output: number
}

// Extrait les compteurs définitifs associés à une réponse assistant de Pi.
export function messageUsage(message: JsonObject): MessageUsage | null {
  const usage = isObject(message.usage) ? message.usage : null
  const cost = usage && isObject(usage.cost) ? usage.cost : null
  if (!usage || !cost || !isNumber(usage.input) || !isNumber(usage.cacheRead) || !isNumber(usage.output) || !isNumber(cost.total)) return null
  return { cacheMiss: usage.input, cacheRead: usage.cacheRead, cost: cost.total, output: usage.output }
}

export function formatTurnCost(value: number): string {
  const digits = value < 0.01 ? 4 : 2
  return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}`
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
