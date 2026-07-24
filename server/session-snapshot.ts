import type { JsonObject } from '../shared/types.ts'

/** Rebuilds the active conversation without dropping messages hidden from Pi by compaction. */
export function activeSessionMessages(entries: JsonObject[], leafId: unknown): JsonObject[] {
  if (typeof leafId !== 'string') return []
  const entriesById = new Map(entries.flatMap((entry) => typeof entry.id === 'string' ? [[entry.id, entry] as const] : []))
  const activeEntries: JsonObject[] = []
  const visited = new Set<string>()
  let id: string | null = leafId
  while (id && !visited.has(id)) {
    visited.add(id)
    const entry = entriesById.get(id)
    if (!entry) break
    activeEntries.push(entry)
    id = typeof entry.parentId === 'string' ? entry.parentId : null
  }
  return visibleSessionMessages(activeEntries.reverse().flatMap(messageFromEntry))
}

/** Keeps messages useful to the interface without exposing hidden custom messages. */
export function visibleSessionMessages(messages: JsonObject[]): JsonObject[] {
  return messages.filter((message) => message.role === 'user'
    || message.role === 'assistant'
    || message.role === 'toolResult'
    || (message.role === 'custom' && message.display === true && typeof message.customType === 'string'))
}

function messageFromEntry(entry: JsonObject): JsonObject[] {
  if (entry.type === 'message' && isObject(entry.message)) return [entry.message]
  if (entry.type !== 'custom_message' || typeof entry.customType !== 'string') return []
  return [{ role: 'custom', customType: entry.customType, content: entry.content, display: entry.display, details: entry.details }]
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
