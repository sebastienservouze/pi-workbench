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

export interface VsCodeStatus {
  available: boolean
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
  files: GitFileChange[]
}

export interface GitSnapshot {
  repository: boolean
  root: string | null
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

export interface GitRevertResult {
  hash: string
}

export interface GitFileDiff {
  path: string
  diff: string
}

export interface WorkspaceFile {
  path: string
  content: string
}

export interface TodoItem {
  id: string
  text: string
  completed: boolean
}

export interface TerminalCommandResult {
  command: string
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
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
  userMessages?: number
  assistantMessages?: number
  toolCalls?: number
  toolResults?: number
  totalMessages?: number
  tokens?: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
    total?: number
  }
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

export interface OpenAiQuotaWindow {
  period: '5h' | '7d'
  remainingPercent: number
  resetsAt?: number
}

export interface CopilotQuotaWindow {
  name: string
  used: number
  limit: number
  resetsAt?: number
}

export interface QuotaProviderSnapshot<T> {
  data: T[]
  updatedAt?: number
  stale: boolean
  error?: string
}

export interface QuotaSnapshot {
  openai: QuotaProviderSnapshot<OpenAiQuotaWindow>
  copilot: QuotaProviderSnapshot<CopilotQuotaWindow>
  refreshing: boolean
  sessionRequired: boolean
}

export type QuotaProviderReport<T> =
  | { ok: true; data: T[] }
  | { ok: false; error: string }

export interface QuotaReport {
  protocol: 'pi-livecraft.quotas'
  version: 1
  refreshedAt: number
  openai: QuotaProviderReport<OpenAiQuotaWindow>
  copilot: QuotaProviderReport<CopilotQuotaWindow>
}
