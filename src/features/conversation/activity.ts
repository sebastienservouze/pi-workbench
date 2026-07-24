import type { JsonObject } from '../../../shared/types.ts'

export interface Activity {
  kind: 'working' | 'thinking' | 'tool-preparing' | 'tool-waiting' | 'writing' | 'waiting'
  thinking?: string
}

/** Converts Pi events into a stable activity state for the conversation indicator. */
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

/** Produces a playful label that precisely describes the current activity. */
export function activityText(activity: Activity, agentName: string | undefined): string {
  return `${activityAgentName(agentName)} ${activityActionText(activity)}`
}

/** Produces the variable part of the label so it can be animated independently of the name. */
export function activityActionText(activity: Activity): string {
  if (activity.kind === 'thinking') return 'is thinking hard…'
  if (activity.kind === 'tool-preparing') return 'is preparing a tool call…'
  if (activity.kind === 'tool-waiting') return 'is waiting for the tool…'
  if (activity.kind === 'writing') return 'is writing…'
  if (activity.kind === 'waiting') return 'is waiting for you 🎤'
  return 'is getting things moving…'
}

export function activityAgentName(agentName: string | undefined): string {
  const name = agentName?.trim()
  return name ? name[0].toUpperCase() + name.slice(1) : 'Pi'
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
