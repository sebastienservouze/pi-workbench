import type { JsonObject } from '../../../shared/types.ts'

export interface MessageUsage {
  cacheMiss: number
  cacheRead: number
  cost: number
  output: number
}

/** Extrait les compteurs définitifs associés à une réponse assistant de Pi. */
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

/** Additionne les réponses assistant d'un tour et les associe à sa dernière réponse. */
export function turnUsageByMessage(messages: JsonObject[]): Map<number, MessageUsage> {
  const usages = new Map<number, MessageUsage>()
  let complete = true
  let lastAssistantIndex: number | null = null
  let total: MessageUsage | null = null

  for (const [index, message] of messages.entries()) {
    if (message.role === 'user') {
      addTurnUsage(usages, lastAssistantIndex, total, complete)
      complete = true
      lastAssistantIndex = null
      total = null
    } else if (message.role === 'assistant') {
      lastAssistantIndex = index
      const usage = messageUsage(message)
      if (!usage) complete = false
      else total = total ? addUsage(total, usage) : usage
    }
  }
  addTurnUsage(usages, lastAssistantIndex, total, complete)
  return usages
}

function addTurnUsage(usages: Map<number, MessageUsage>, index: number | null, usage: MessageUsage | null, complete: boolean): void {
  if (complete && index !== null && usage) usages.set(index, usage)
}

function addUsage(left: MessageUsage, right: MessageUsage): MessageUsage {
  return {
    cacheMiss: left.cacheMiss + right.cacheMiss,
    cacheRead: left.cacheRead + right.cacheRead,
    cost: left.cost + right.cost,
    output: left.output + right.output,
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
