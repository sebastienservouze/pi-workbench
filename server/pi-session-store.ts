import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'
import type { RecentSession } from '../shared/types.ts'

const sessionDirectory = process.env.PI_CODING_AGENT_SESSION_DIR ?? join(homedir(), '.pi', 'agent', 'sessions')

interface PiSessionHeader {
  type: 'session'
  id: string
  timestamp: string
  cwd: string
}

/** Lit uniquement les métadonnées nécessaires à la reprise d'une session Pi. */
export async function listRecentPiSessions(cwd: string, limit = 10, directory = sessionDirectory): Promise<RecentSession[]> {
  const paths = await listSessionFiles(directory)
  const files = await Promise.all(paths.map(async (path) => ({ path, updatedAt: (await stat(path)).mtimeMs })))
  files.sort((left, right) => right.updatedAt - left.updatedAt)

  const sessions: RecentSession[] = []
  for (const file of files) {
    const session = await readPiSession(file.path, file.updatedAt)
    if (session?.cwd === cwd) sessions.push(session)
    if (sessions.length === limit) break
  }
  return sessions
}

export async function loadPiSession(path: string): Promise<RecentSession> {
  const [canonicalPath, canonicalDirectory] = await Promise.all([realpath(path), realpath(sessionDirectory)])
  const relativePath = relative(canonicalDirectory, canonicalPath)
  if (!relativePath || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) throw new Error('Pi session file must be stored in the Pi session directory')
  const session = await readPiSession(canonicalPath, (await stat(canonicalPath)).mtimeMs)
  if (!session) throw new Error('Invalid Pi session file')
  return session
}

async function listSessionFiles(directory: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }

  const paths = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listSessionFiles(path)
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : []
  }))
  return paths.flat()
}

async function readPiSession(path: string, updatedAt: number): Promise<RecentSession | null> {
  let lines: string[]
  try {
    lines = (await readFile(path, 'utf8')).split('\n')
  } catch {
    return null
  }

  const header = parseHeader(lines[0])
  if (!header) return null
  const name = lines.reduce<string | undefined>((current, line) => current ?? parseSessionName(line), undefined)
  return {
    id: header.id,
    cwd: header.cwd,
    name: name || new Date(header.timestamp).toLocaleString('fr-FR'),
    sessionPath: path,
    updatedAt,
  }
}

function parseHeader(line: string | undefined): PiSessionHeader | null {
  try {
    const value: unknown = JSON.parse(line ?? '')
    if (!isObject(value) || value.type !== 'session' || typeof value.id !== 'string' || typeof value.timestamp !== 'string' || typeof value.cwd !== 'string') return null
    return { type: 'session', id: value.id, timestamp: value.timestamp, cwd: value.cwd }
  } catch {
    return null
  }
}

function parseSessionName(line: string): string | undefined {
  try {
    const value: unknown = JSON.parse(line)
    return isObject(value) && value.type === 'session_info' && typeof value.name === 'string' && value.name.trim()
      ? value.name.trim()
      : undefined
  } catch {
    return undefined
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFound(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT'
}
