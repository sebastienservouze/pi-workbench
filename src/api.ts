import type { DirectoryListing, GitActionResult, GitFileDiff, GitRevertResult, GitSnapshot, JsonObject, QuotaSnapshot, RecentSession, SessionSnapshot, SessionSummary, TerminalCommandResult, TodoItem, WorkspaceFile } from '../shared/types.ts'

export async function listSessions(): Promise<SessionSummary[]> {
  return request<SessionSummary[]>('/api/sessions')
}

export async function listRecentSessions(cwd: string): Promise<RecentSession[]> {
  return request<RecentSession[]>(`/api/sessions/recent?cwd=${encodeURIComponent(cwd)}`)
}

export async function listDirectories(path: string): Promise<DirectoryListing> {
  return request<DirectoryListing>(`/api/directories?path=${encodeURIComponent(path)}`)
}

export async function openExplorer(cwd: string): Promise<void> {
  await request<void>('/api/explorer', {
    method: 'POST',
    body: JSON.stringify({ cwd }),
  })
}

export async function getGitSnapshot(cwd: string): Promise<GitSnapshot> {
  return request<GitSnapshot>(`/api/git?cwd=${encodeURIComponent(cwd)}`)
}

export async function getGitFileDiff(cwd: string, path: string, commitHash?: string): Promise<GitFileDiff> {
  const commit = commitHash ? `&commit=${encodeURIComponent(commitHash)}` : ''
  return request<GitFileDiff>(`/api/git/diff?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}${commit}`)
}

export async function getWorkspaceFile(cwd: string, path: string): Promise<WorkspaceFile> {
  return request<WorkspaceFile>(`/api/files?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`)
}

export async function getWorkspaceFilePath(cwd: string, path: string): Promise<{ absolutePath: string; path: string }> {
  return request<{ absolutePath: string; path: string }>(`/api/files/path?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`)
}

export async function getTodos(cwd: string): Promise<TodoItem[]> {
  return request<TodoItem[]>(`/api/todos?cwd=${encodeURIComponent(cwd)}`)
}

export async function updateTodos(cwd: string, todos: TodoItem[]): Promise<TodoItem[]> {
  return request<TodoItem[]>('/api/todos', {
    method: 'PUT',
    body: JSON.stringify({ cwd, todos }),
  })
}

export async function executeTerminalCommand(cwd: string, command: string): Promise<TerminalCommandResult> {
  return request<TerminalCommandResult>('/api/terminal', {
    method: 'POST',
    body: JSON.stringify({ command, cwd }),
  })
}

export async function commitAndPush(cwd: string, message: string): Promise<GitActionResult> {
  return request<GitActionResult>('/api/git/action', {
    method: 'POST',
    body: JSON.stringify({ cwd, message }),
  })
}

export async function revertGitCommit(cwd: string, hash: string): Promise<GitRevertResult> {
  return request<GitRevertResult>('/api/git/revert', {
    method: 'POST',
    body: JSON.stringify({ cwd, hash }),
  })
}

export async function createSession(cwd: string): Promise<SessionSummary> {
  return request<SessionSummary>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ cwd }),
  })
}

export async function openSession(cwd: string, sessionPath: string): Promise<SessionSummary> {
  return request<SessionSummary>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ cwd, sessionPath }),
  })
}

export async function getSnapshot(sessionId: string): Promise<SessionSnapshot> {
  return request<SessionSnapshot>(`/api/sessions/${encodeURIComponent(sessionId)}/snapshot`)
}

export async function getQuotas(): Promise<QuotaSnapshot> {
  return request<QuotaSnapshot>('/api/quotas')
}

export async function refreshQuotas(sessionId: string, automatic = false): Promise<QuotaSnapshot> {
  return request<QuotaSnapshot>('/api/quotas/refresh', {
    method: 'POST',
    body: JSON.stringify({ automatic, sessionId }),
  })
}

export async function sendPiCommand(sessionId: string, command: JsonObject): Promise<JsonObject> {
  return request<JsonObject>(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
    method: 'POST',
    body: JSON.stringify(command),
  })
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: typeof init?.body === 'string' ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  })
  const value: unknown = await response.json()
  if (!response.ok) {
    const message = isObject(value) && typeof value.error === 'string' ? value.error : `Request failed (${response.status})`
    throw new Error(message)
  }
  return value as T
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
