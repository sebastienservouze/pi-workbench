import type { JsonObject } from '../shared/types.ts'

/** Conserve les messages utiles à l’interface sans exposer les messages personnalisés marqués comme cachés. */
export function visibleSessionMessages(messages: JsonObject[]): JsonObject[] {
  return messages.filter((message) => message.role === 'user'
    || message.role === 'assistant'
    || message.role === 'toolResult'
    || (message.role === 'custom' && message.display === true && typeof message.customType === 'string'))
}
