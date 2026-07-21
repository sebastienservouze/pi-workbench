import type { JsonObject } from '../../../shared/types.ts'

export type CommandId = 'new-session' | 'send' | 'abort' | 'toggle-git' | 'open-thinking' | 'open-model' | 'open-agent' | 'copy-last-response' | 'open-palette' | 'open-settings'

export interface CommandDefinition {
  id: CommandId
  label: string
  description?: string
}

export const commandDefinitions: CommandDefinition[] = [
  { id: 'new-session', label: 'Nouvelle session' },
  { id: 'send', label: 'Envoyer le message' },
  { id: 'abort', label: 'Interrompre Pi' },
  { id: 'toggle-git', label: 'Afficher ou masquer Git' },
  { id: 'open-thinking', label: 'Ouvrir le niveau de réflexion' },
  { id: 'open-model', label: 'Ouvrir le sélecteur de modèle' },
  { id: 'open-agent', label: 'Ouvrir le sélecteur d’agent' },
  { id: 'copy-last-response', label: 'Copier la dernière réponse' },
  { id: 'open-palette', label: 'Ouvrir la palette de commandes' },
  { id: 'open-settings', label: 'Ouvrir les paramètres' },
]

export const defaultShortcuts: Partial<Record<CommandId, string>> = {
  'open-palette': 'mod+k',
  'open-settings': 'mod+,',
  send: 'mod+enter',
  abort: 'escape',
}

/** Normalise une combinaison clavier pour la comparer et la stocker de façon stable. */
export function shortcutFromEvent(event: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }): string {
  const modifiers = [event.metaKey || event.ctrlKey ? 'mod' : '', event.altKey ? 'alt' : '', event.shiftKey ? 'shift' : ''].filter(Boolean)
  const key = event.key.toLowerCase() === ' ' ? 'space' : event.key.toLowerCase()
  return [...modifiers, key].join('+')
}

/** Retourne les raccourcis en conflit, en ignorant les commandes sans raccourci. */
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

/** Extrait le texte copiable d’une réponse assistant sans modifier son Markdown. */
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
