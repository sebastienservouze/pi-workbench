import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { ManagerClient } from './manager-client.ts'
import type { JsonObject, ManagerEvent, SessionSnapshot } from '../shared/types.ts'

const host = '127.0.0.1'
const port = readPort('PI_WORKBENCH_BACKEND_PORT', 43_121)
const managerPort = readPort('PI_WORKBENCH_MANAGER_PORT', 43_120)
const manager = new ManagerClient(host, managerPort)
const eventClients = new Set<ServerResponse>()
const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url))

manager.on('event', (event: ManagerEvent) => broadcast(event))
manager.on('connected', () => broadcast({ kind: 'event', event: 'manager_connected', sessionId: '' }))
manager.on('disconnected', () => broadcast({ kind: 'event', event: 'manager_disconnected', sessionId: '' }))
manager.start()

const server = createServer((request, response) => {
  void route(request, response).catch((error) => {
    if (!response.headersSent) sendJson(response, error instanceof HttpError ? error.status : 500, { error: errorMessage(error) })
    else response.end()
  })
})

server.listen(port, host, () => {
  console.log(`Pi backend listening on http://${host}:${port}`)
})

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? 'GET'
  const url = new URL(request.url ?? '/', `http://${host}`)

  if (method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, manager.connected ? 200 : 503, { ok: true, managerConnected: manager.connected })
    return
  }

  if (method === 'GET' && url.pathname === '/api/events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.write('retry: 500\n\n')
    eventClients.add(response)
    request.on('close', () => eventClients.delete(response))
    return
  }

  if (method === 'GET' && url.pathname === '/api/sessions') {
    sendJson(response, 200, await manager.request({ action: 'list' }))
    return
  }

  if (method === 'POST' && url.pathname === '/api/sessions') {
    const body = await readJsonBody(request)
    if (typeof body.cwd !== 'string' || typeof body.name !== 'string') throw new HttpError(400, 'cwd and name are required')
    const cwd = await resolveWorkingDirectory(body.cwd)
    const session = await manager.request({ action: 'create', cwd, name: body.name })
    sendJson(response, 201, session)
    return
  }

  const snapshotMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/snapshot$/)
  if (method === 'GET' && snapshotMatch) {
    const sessionId = decodeURIComponent(snapshotMatch[1])
    const [state, messages, models, commands] = await Promise.all([
      piCommand(sessionId, { type: 'get_state' }),
      piCommand(sessionId, { type: 'get_messages' }),
      piCommand(sessionId, { type: 'get_available_models' }),
      piCommand(sessionId, { type: 'get_commands' }),
    ])
    const snapshot: SessionSnapshot = {
      state: objectData(state),
      messages: arrayData(messages, 'messages'),
      models: arrayData(models, 'models'),
      commands: arrayData(commands, 'commands'),
    }
    sendJson(response, 200, snapshot)
    return
  }

  const commandMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/commands$/)
  if (method === 'POST' && commandMatch) {
    const command = await readJsonBody(request)
    if (typeof command.type !== 'string' || command.type.length > 100) throw new HttpError(400, 'A valid Pi command type is required')
    const data = await manager.request(
      { action: 'command', sessionId: decodeURIComponent(commandMatch[1]), command },
      10 * 60_000,
    )
    sendJson(response, 200, data)
    return
  }

  if (method === 'GET' || method === 'HEAD') {
    await serveStatic(url.pathname, method, response)
    return
  }

  sendJson(response, 404, { error: 'Not found' })
}

async function piCommand(sessionId: string, command: JsonObject): Promise<JsonObject> {
  const response = await manager.request({ action: 'command', sessionId, command })
  if (!isObject(response)) throw new Error('Invalid response from Pi manager')
  return response
}

function objectData(response: JsonObject): JsonObject | null {
  return isObject(response.data) ? response.data : null
}

function arrayData(response: JsonObject, key: string): JsonObject[] {
  if (!isObject(response.data) || !Array.isArray(response.data[key])) return []
  return response.data[key].filter(isObject)
}

async function resolveWorkingDirectory(input: string): Promise<string> {
  const trimmed = input.trim()
  if (!trimmed) throw new HttpError(400, 'Working directory is required')
  const expanded = trimmed === '~' ? homedir() : trimmed.startsWith('~/') ? resolve(homedir(), trimmed.slice(2)) : trimmed
  let canonical: string
  try {
    canonical = await realpath(expanded)
  } catch {
    throw new HttpError(400, 'Working directory does not exist')
  }
  if (!(await stat(canonical)).isDirectory()) throw new HttpError(400, 'Working directory must be a directory')
  return canonical
}

async function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 2 * 1024 * 1024) throw new HttpError(413, 'Request body exceeds 2 MiB')
    chunks.push(buffer)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!isObject(value)) throw new Error('Expected an object')
    return value
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

async function serveStatic(pathname: string, method: string, response: ServerResponse): Promise<void> {
  const requestedPath = pathname === '/' ? 'index.html' : pathname.slice(1)
  let filePath = resolve(distDirectory, requestedPath)
  if (!filePath.startsWith(`${resolve(distDirectory)}${sep}`)) throw new HttpError(404, 'Not found')

  try {
    if (!(await stat(filePath)).isFile()) throw new Error('Not a file')
  } catch {
    filePath = resolve(distDirectory, 'index.html')
    try {
      if (!(await stat(filePath)).isFile()) throw new Error('Missing build')
    } catch {
      throw new HttpError(404, 'Frontend build not found; run npm run build')
    }
  }

  response.writeHead(200, { 'Content-Type': contentType(filePath) })
  if (method === 'HEAD') response.end()
  else createReadStream(filePath).pipe(response)
}

function broadcast(event: unknown): void {
  const frame = `data: ${JSON.stringify(event)}\n\n`
  for (const client of eventClients) client.write(frame)
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

function contentType(filePath: string): string {
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  }
  return types[extname(filePath)] ?? 'application/octet-stream'
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

class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
