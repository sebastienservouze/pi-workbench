import type { JsonObject } from '../../../shared/types.ts'

export interface Activity {
  kind: 'working' | 'thinking' | 'tool-preparing' | 'tool-waiting' | 'writing' | 'waiting'
  thinking?: string
}

/** Convertit les événements Pi en un état d'activité stable pour l'indicateur de conversation. */
export function activityForPiEvent(current: Activity | null, event: JsonObject): Activity | null {
  if (event.type === 'agent_start' || event.type === 'message_start') return { kind: 'working' }
  if (event.type === 'agent_settled') return null
  if (event.type === 'tool_execution_start') return { kind: 'tool-waiting' }
  if (event.type === 'tool_execution_end') return { kind: 'working' }
  if (event.type !== 'message_update' || !isObject(event.assistantMessageEvent)) return current

  const update = event.assistantMessageEvent
  if (update.type === 'thinking_start') return { kind: 'thinking', thinking: '' }
  if (update.type === 'thinking_delta' && typeof update.delta === 'string') {
    const thinking = `${current?.kind === 'thinking' ? current.thinking ?? '' : ''}${update.delta}`
    return { kind: 'thinking', thinking }
  }
  if (update.type === 'toolcall_start' || update.type === 'toolcall_delta' || update.type === 'toolcall_end') return { kind: 'tool-preparing' }
  if (update.type === 'text_start' || update.type === 'text_delta') return { kind: 'writing' }
  return current
}

export function waitingActivity(): Activity {
  return { kind: 'waiting' }
}

/** Produit un libellé enjoué qui décrit précisément l'activité courante. */
export function activityText(activity: Activity, agentName: string | undefined): string {
  return `${activityAgentName(agentName)} ${activityActionText(activity)}`
}

/** Produit la partie variable du libellé pour permettre de l'animer indépendamment du nom. */
export function activityActionText(activity: Activity): string {
  if (activity.kind === 'thinking') return 'fait chauffer ses neurones…'
  if (activity.kind === 'tool-preparing') return 'prépare un appel d’outil aux petits oignons…'
  if (activity.kind === 'tool-waiting') return 'attend le verdict de l’outil…'
  if (activity.kind === 'writing') return 'fait danser les mots…'
  if (activity.kind === 'waiting') return 'vous passe le micro 🎤'
  return 'met les rouages en marche…'
}

export function activityAgentName(agentName: string | undefined): string {
  const name = agentName?.trim()
  return name ? name[0].toUpperCase() + name.slice(1) : 'Pi'
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
