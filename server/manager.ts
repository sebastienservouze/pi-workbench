import { randomUUID } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { createServer, type Socket } from 'node:net'
import { JsonLineDecoder, encodeJsonLine } from './jsonl.ts'
import { PiProcess } from './pi-process.ts'
import type {
  JsonObject,
  ManagerEvent,
  ManagerRequest,
  ManagerResponse,
  SessionSummary,
} from '../shared/types.ts'

const host = '127.0.0.1'
const port = readPort('PI_WORKBENCH_MANAGER_PORT', 43_120)
const clients = new Set<Socket>()
const sessions = new Map<string, ManagedSession>()

interface ManagedSession {
  summary: SessionSummary
  pi: PiProcess
  pendingUi: Map<string, JsonObject>
}

const server = createServer((socket) => {
  clients.add(socket)
  socket.setNoDelay(true)
  const decoder = new JsonLineDecoder((value) => void handleRequest(socket, value))
  socket.on('data', (chunk) => {
    try {
      decoder.push(chunk)
    } catch (error) {
      respond(socket, { kind: 'response', id: '', ok: false, error: errorMessage(error) })
      socket.destroy()
    }
  })
  socket.on('end', () => decoder.end())
  socket.on('close', () => clients.delete(socket))
  socket.on('error', () => clients.delete(socket))
})

server.on('error', (error) => {
  console.error(`Pi manager failed: ${error.message}`)
  process.exitCode = 1
})

server.listen(port, host, () => {
  console.log(`Pi manager listening on tcp://${host}:${port}`)
})

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

function shutdown(): void {
  for (const session of sessions.values()) session.pi.terminate()
  server.close(() => process.exit(0))
}

async function handleRequest(socket: Socket, value: unknown): Promise<void> {
  if (!isManagerRequest(value)) {
    respond(socket, { kind: 'response', id: '', ok: false, error: 'Invalid manager request' })
    return
  }

  try {
    let data: unknown
    if (value.action === 'list') data = listSessions()
    else if (value.action === 'create') data = await createSession(value)
    else if (value.action === 'open') data = await openSession(value)
    else data = await sendCommand(value)
    respond(socket, { kind: 'response', id: value.id, ok: true, data })
  } catch (error) {
    respond(socket, { kind: 'response', id: value.id, ok: false, error: errorMessage(error) })
  }
}

function listSessions(): SessionSummary[] {
  return [...sessions.values()].map(({ summary, pendingUi }) => ({
    ...summary,
    pendingUi: [...pendingUi.values()],
  }))
}

async function createSession(request: ManagerRequest): Promise<SessionSummary> {
  if (typeof request.cwd !== 'string') throw new Error('Session cwd is required')
  const cwd = await realpath(request.cwd)
  if (!(await stat(cwd)).isDirectory()) throw new Error('Session cwd must be a directory')

  const summary: SessionSummary = {
    id: randomUUID(),
    cwd,
    name: 'Nouvelle session',
    status: 'starting',
    pendingUi: [],
  }

  const session = await startSession(summary)
  sessions.set(summary.id, session)
  broadcast({ kind: 'event', event: 'session_created', sessionId: summary.id, data: summary })
  return { ...summary, pendingUi: [] }
}

async function openSession(request: ManagerRequest): Promise<SessionSummary> {
  if (typeof request.cwd !== 'string' || typeof request.name !== 'string' || typeof request.sessionPath !== 'string') {
    throw new Error('Session cwd, name and path are required')
  }
  const existing = [...sessions.values()].find(({ summary }) => summary.sessionPath === request.sessionPath)
  if (existing) return { ...existing.summary, pendingUi: [...existing.pendingUi.values()] }

  const summary: SessionSummary = {
    id: randomUUID(),
    cwd: request.cwd,
    name: request.name,
    sessionPath: request.sessionPath,
    status: 'starting',
    pendingUi: [],
  }
  const session = await startSession(summary)
  sessions.set(summary.id, session)
  broadcast({ kind: 'event', event: 'session_created', sessionId: summary.id, data: summary })
  return { ...summary, pendingUi: [] }
}

async function startSession(summary: SessionSummary): Promise<ManagedSession> {
  const pi = new PiProcess(summary.cwd, summary.id, summary.sessionPath)
  const session: ManagedSession = { summary, pi, pendingUi: new Map() }

  pi.on('event', (event: JsonObject) => handlePiEvent(summary.id, session, event))
  pi.on('exit', (detail: unknown) => {
    summary.status = 'exited'
    broadcast({ kind: 'event', event: 'session_exited', sessionId: summary.id, data: detail })
  })

  try {
    const state = await pi.request({ type: 'get_state' })
    const sessionPath = isObject(state.data) && typeof state.data.sessionFile === 'string' ? state.data.sessionFile : undefined
    if (sessionPath) summary.sessionPath = sessionPath
    summary.status = 'idle'
    return session
  } catch (error) {
    pi.terminate()
    throw error
  }
}

async function sendCommand(request: ManagerRequest): Promise<JsonObject> {
  if (typeof request.sessionId !== 'string' || !isObject(request.command)) {
    throw new Error('Session id and Pi command are required')
  }
  const session = sessions.get(request.sessionId)
  if (!session) throw new Error('Unknown session')
  if (session.summary.status === 'exited') throw new Error('Pi session has exited')

  if (request.command.type === 'extension_ui_response') {
    if (typeof request.command.id === 'string') session.pendingUi.delete(request.command.id)
    session.pi.send(request.command)
    return { success: true }
  }
  return session.pi.request(request.command)
}

function handlePiEvent(sessionId: string, session: ManagedSession, event: JsonObject): void {
  if (event.type === 'session_info_changed') {
    session.summary.name = typeof event.name === 'string' && event.name.trim() ? event.name.trim() : 'Nouvelle session'
  }
  if (event.type === 'agent_start') session.summary.status = 'running'
  if (event.type === 'agent_settled') session.summary.status = 'idle'
  if (event.type === 'extension_ui_request' && event.method === 'setStatus' && event.statusKey === 'agent') {
    session.summary.activeAgent = activeAgentFromStatus(event.statusText)
    event.activeAgent = session.summary.activeAgent
  }
  if (event.type === 'extension_ui_request' && isBlockingUiRequest(event) && typeof event.id === 'string') {
    session.pendingUi.set(event.id, event)
  }
  broadcast({ kind: 'event', event: 'pi', sessionId, data: event })
}

function activeAgentFromStatus(statusText: unknown): string | undefined {
  if (typeof statusText !== 'string') return undefined
  const prefix = 'Agent:'
  const prefixIndex = statusText.indexOf(prefix)
  if (prefixIndex === -1) return undefined
  const rawName = statusText.slice(prefixIndex + prefix.length)
  const endIndex = rawName.indexOf('\u001b')
  const name = rawName.slice(0, endIndex === -1 ? undefined : endIndex).trim()
  return name || undefined
}

function isBlockingUiRequest(event: JsonObject): boolean {
  return event.method === 'select' || event.method === 'confirm' || event.method === 'input' || event.method === 'editor'
}

function broadcast(event: ManagerEvent): void {
  const line = encodeJsonLine(event)
  for (const client of clients) {
    if (client.writable) client.write(line)
  }
}

function respond(socket: Socket, response: ManagerResponse): void {
  if (socket.writable) socket.write(encodeJsonLine(response))
}

function isManagerRequest(value: unknown): value is ManagerRequest {
  if (!isObject(value) || typeof value.id !== 'string') return false
  return value.action === 'list' || value.action === 'create' || value.action === 'open' || value.action === 'command'
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readPort(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error(`${name} must be a valid port`)
  return value
}
