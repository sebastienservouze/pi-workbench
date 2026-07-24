import type { JsonObject, SessionSummary } from '../../../shared/types.ts'

export type PiConnection = 'connecting' | 'connected' | 'disconnected'
export type SessionIndicator = 'connected' | 'reconnecting' | 'working' | 'disconnected'

export interface Activity {
  kind: 'connecting' | 'connected' | 'disconnected' | 'exited' | 'working' | 'thinking' | 'tool-preparing' | 'tool-waiting' | 'writing' | 'retrying' | 'compacting'
  thinking?: string
  attempt?: number
  maxAttempts?: number
}

/** Converts Pi events into a stable activity state for the conversation indicator. */
export function activityForPiEvent(current: Activity | null, event: JsonObject): Activity | null {
  if (event.type === 'agent_start' || event.type === 'message_start' || event.type === 'compaction_end') return { kind: 'working' }
  if (event.type === 'compaction_start') return { kind: 'compacting' }
  if (event.type === 'agent_settled') return null
  if (event.type === 'auto_retry_start') {
    return {
      kind: 'retrying',
      attempt: typeof event.attempt === 'number' ? event.attempt : undefined,
      maxAttempts: typeof event.maxAttempts === 'number' ? event.maxAttempts : undefined,
    }
  }
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

/** Reconciles live activity with the manager and process states available after a page reload. */
export function sessionActivity(current: Activity | null, status: SessionSummary['status'], connection: PiConnection): Activity | null {
  if (connection === 'connecting') return { kind: 'connecting' }
  if (connection === 'disconnected') return { kind: 'disconnected' }
  if (status === 'exited') return { kind: 'exited' }
  if (status === 'starting') return { kind: 'connecting' }
  if (status !== 'running') return { kind: 'connected' }
  return current ?? { kind: 'working' }
}

/** Produces a playful label that precisely describes the current activity. */
export function activityText(activity: Activity, agentName: string | undefined): string {
  return `${activityAgentName(agentName)} ${activityActionText(activity)}`
}

/** Produces the variable part of the label so it can be animated independently of the name. */
export function activityActionText(activity: Activity): string {
  if (activity.kind === 'connecting') return 'is untangling the connection cable…'
  if (activity.kind === 'connected') return 'is plugged in and ready ⚡'
  if (activity.kind === 'disconnected') return 'is off the radar 📡'
  if (activity.kind === 'exited') return 'has left the building 👋'
  if (activity.kind === 'retrying') {
    const progress = activity.attempt !== undefined && activity.maxAttempts !== undefined ? ` (${activity.attempt}/${activity.maxAttempts})` : ''
    return `is reconnecting to the provider${progress}…`
  }
  if (activity.kind === 'compacting') return 'is compacting the session…'
  if (activity.kind === 'thinking') return 'is thinking hard…'
  if (activity.kind === 'tool-preparing') return 'is preparing a tool call…'
  if (activity.kind === 'tool-waiting') return 'is waiting for the tool…'
  if (activity.kind === 'writing') return 'is writing…'
  return 'is getting things moving…'
}

/** Maps the conversation activity to the persistent session status dot. */
export function sessionIndicator(activity: Activity | null): SessionIndicator {
  if (!activity || activity.kind === 'connected') return 'connected'
  if (activity.kind === 'connecting' || activity.kind === 'retrying') return 'reconnecting'
  if (activity.kind === 'disconnected' || activity.kind === 'exited') return 'disconnected'
  return 'working'
}

/** Returns the accessible label for the persistent session status dot. */
export function sessionIndicatorLabel(indicator: SessionIndicator): string {
  if (indicator === 'connected') return 'Pi is connected'
  if (indicator === 'reconnecting') return 'Reconnecting to Pi'
  if (indicator === 'working') return 'Pi is working'
  return 'Pi is disconnected'
}

export function activityAgentName(agentName: string | undefined): string {
  const name = agentName?.trim()
  return name ? name[0].toUpperCase() + name.slice(1) : 'Pi'
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
