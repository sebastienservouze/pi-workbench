export type JsonObject = Record<string, unknown>

export interface SessionSummary {
  id: string
  cwd: string
  name: string
  activeAgent?: string
  status: 'starting' | 'idle' | 'running' | 'exited'
  pendingUi: JsonObject[]
}

export interface ManagerRequest {
  id: string
  action: 'list' | 'create' | 'command'
  sessionId?: string
  cwd?: string
  name?: string
  command?: JsonObject
}

export interface ManagerResponse {
  kind: 'response'
  id: string
  ok: boolean
  data?: unknown
  error?: string
}

export interface ManagerEvent {
  kind: 'event'
  event: 'session_created' | 'session_exited' | 'manager_connected' | 'manager_disconnected' | 'pi'
  sessionId: string
  data?: unknown
}

export type ManagerMessage = ManagerResponse | ManagerEvent

export interface SessionSnapshot {
  state: JsonObject | null
  messages: JsonObject[]
  models: JsonObject[]
  commands: JsonObject[]
}
