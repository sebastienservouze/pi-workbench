import type { JsonObject } from '../../../shared/types.ts'

export type CommandId = 'new-session' | 'send' | 'abort' | 'open-thinking' | 'open-model' | 'open-agent' | 'copy-last-response' | 'open-palette' | 'open-settings'

export interface CommandDefinition {
  id: CommandId
  label: string
  description?: string
}

export const commandDefinitions: CommandDefinition[] = [
  { id: 'new-session', label: 'New session' },
  { id: 'send', label: 'Send message' },
  { id: 'abort', label: 'Abort Pi' },
  { id: 'open-thinking', label: 'Open thinking level' },
  { id: 'open-model', label: 'Open model picker' },
  { id: 'open-agent', label: 'Open agent picker' },
  { id: 'copy-last-response', label: 'Copy last response' },
  { id: 'open-palette', label: 'Open command palette' },
  { id: 'open-settings', label: 'Open settings' },
]

export const defaultShortcuts: Partial<Record<CommandId, string>> = {
  'open-palette': 'mod+k',
  'open-settings': 'mod+,',
  send: 'mod+enter',
  abort: 'escape',
}

/** Normalizes a keyboard combination for stable comparison and storage. */
export function shortcutFromEvent(event: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }): string {
  const modifiers = [event.metaKey || event.ctrlKey ? 'mod' : '', event.altKey ? 'alt' : '', event.shiftKey ? 'shift' : ''].filter(Boolean)
  const key = event.key.toLowerCase() === ' ' ? 'space' : event.key.toLowerCase()
  return [...modifiers, key].join('+')
}

/** Returns conflicting shortcuts while ignoring commands without a shortcut. */
export function shortcutConflicts(shortcuts: Partial<Record<CommandId, string>>): Set<CommandId> {
  const seen = new Map<string, CommandId>()
  const conflicts = new Set<CommandId>()
  for (const [id, shortcut] of Object.entries(shortcuts) as [CommandId, string | undefined][]) {
    if (!shortcut) continue
    const previous = seen.get(shortcut)
    if (previous) { conflicts.add(previous); conflicts.add(id) }
    else seen.set(shortcut, id)
  }
  return conflicts
}

/** Extracts copyable text from an assistant response without changing its Markdown. */
export function lastAssistantText(messages: JsonObject[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue
    const content = message.content ?? message.output
    if (typeof content === 'string' && content.trim()) return content
    if (Array.isArray(content)) {
      const text = content.filter(isObject).filter((part) => part.type === 'text' && typeof part.text === 'string').map((part) => String(part.text)).join('')
      if (text.trim()) return text
    }
  }
  return ''
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
