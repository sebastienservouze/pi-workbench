import type { JsonObject } from '../shared/types.ts'

export interface Activity {
  kind: 'working' | 'thinking' | 'tool' | 'writing' | 'waiting'
  thinking?: string
  toolName?: string
}

const toolActivityText: Record<string, string> = {
  ask_user_question: 'vous pose une question',
  fffind: 'repère les fichiers pertinents',
  ffgrep: 'cherche dans le code',
  read: 'lit un fichier',
  write: 'écrit un fichier',
  edit: 'modifie un fichier',
  bash: 'exécute une commande',
  web_search: 'recherche sur le web',
  fetch_content: 'consulte du contenu',
}

export function activityForPiEvent(current: Activity | null, event: JsonObject): Activity | null {
  if (event.type === 'agent_start' || event.type === 'message_start') return { kind: 'working' }
  if (event.type === 'agent_settled') return null
  if (event.type === 'tool_execution_start') {
    return { kind: 'tool', toolName: typeof event.toolName === 'string' ? event.toolName : 'outil' }
  }
  if (event.type === 'tool_execution_end') return { kind: 'working' }
  if (event.type !== 'message_update' || !isObject(event.assistantMessageEvent)) return current

  const update = event.assistantMessageEvent
  if (update.type === 'thinking_start') return { kind: 'thinking', thinking: '' }
  if (update.type === 'thinking_delta' && typeof update.delta === 'string') {
    const thinking = `${current?.kind === 'thinking' ? current.thinking ?? '' : ''}${update.delta}`
    return { kind: 'thinking', thinking }
  }
  if (update.type === 'text_start' || update.type === 'text_delta') return { kind: 'writing' }
  return current
}

export function waitingActivity(): Activity {
  return { kind: 'waiting' }
}

export function activityText(activity: Activity, agentName: string | undefined): string {
  const agent = displayAgentName(agentName)
  if (activity.kind === 'thinking') return activity.thinking ? `${agent} réfléchit — ${lastLine(activity.thinking).replaceAll('**', '')}` : `${agent} réfléchit…`
  if (activity.kind === 'tool') {
    const toolName = activity.toolName ?? 'un outil'
    return `${agent} ${toolActivityText[toolName] ?? `utilise ${toolName}`}`
  }
  if (activity.kind === 'writing') return `${agent} écrit…`
  if (activity.kind === 'waiting') return `${agent} attend votre intervention`
  return `${agent} travaille…`
}

function lastLine(text: string): string {
  return text.trimEnd().split(/\r?\n/).at(-1) ?? ''
}

function displayAgentName(agentName: string | undefined): string {
  const name = agentName?.trim()
  return name ? name[0].toUpperCase() + name.slice(1) : 'Pi'
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
