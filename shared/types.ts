export type JsonObject = Record<string, unknown>

export interface SessionSummary {
  id: string
  cwd: string
  name: string
  sessionPath?: string
  activeAgent?: string
  status: 'starting' | 'idle' | 'running' | 'exited'
  pendingUi: JsonObject[]
}

export interface RecentSession {
  id: string
  cwd: string
  name: string
  sessionPath: string
  updatedAt: number
}

export interface DirectoryEntry {
  name: string
  path: string
}

export interface DirectoryListing {
  path: string
  parentPath: string | null
  directories: DirectoryEntry[]
}

export interface GitFileChange {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  additions: number | null
  deletions: number | null
}

export interface GitCommit {
  hash: string
  subject: string
  files: string[]
}

export interface GitSnapshot {
  repository: boolean
  branch: string | null
  files: GitFileChange[]
  ahead: number
  commits: GitCommit[]
}

export interface GitActionResult {
  committed: boolean
  pushed: boolean
  pushError?: string
}

export interface ManagerRequest {
  id: string
  action: 'list' | 'create' | 'open' | 'command'
  sessionId?: string
  cwd?: string
  name?: string
  sessionPath?: string
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

export interface SessionStats {
  cost?: number
  contextUsage?: {
    tokens?: number | null
    contextWindow?: number | null
    percent?: number | null
  }
}

export interface SessionSnapshot {
  state: JsonObject | null
  messages: JsonObject[]
  models: JsonObject[]
  commands: JsonObject[]
  stats: SessionStats | null
}
