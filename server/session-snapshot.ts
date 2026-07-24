import type { JsonObject } from '../shared/types.ts'

/** Keeps messages useful to the interface without exposing hidden custom messages. */
export function visibleSessionMessages(messages: JsonObject[]): JsonObject[] {
  return messages.filter((message) => message.role === 'user'
    || message.role === 'assistant'
    || message.role === 'toolResult'
    || (message.role === 'custom' && message.display === true && typeof message.customType === 'string'))
}
