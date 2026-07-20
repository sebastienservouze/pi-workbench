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
export async function listRecentPiSessions(cwd: string, directory = sessionDirectory): Promise<RecentSession[]> {
  const paths = await listSessionFiles(directory)
  const sessions = await Promise.all(paths.map(async (path) => readPiSession(path, (await stat(path)).mtimeMs)))

  return sessions
    .filter((session): session is RecentSession => session?.cwd === cwd)
    .sort((left, right) => right.updatedAt - left.updatedAt)
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
  const name = lines.reduce<string | undefined>((current, line) => parseSessionName(line) ?? current, undefined)
  const prompt = lines.reduce<string | undefined>((current, line) => current ?? parseUserPrompt(line), undefined)
  const lastMessageAt = lines.reduce<number | undefined>((current, line) => {
    const timestamp = parseMessageTimestamp(line)
    return timestamp === undefined || (current !== undefined && timestamp <= current) ? current : timestamp
  }, undefined)
  const createdAt = Date.parse(header.timestamp)
  return {
    id: header.id,
    cwd: header.cwd,
    name: name || prompt || 'Nouvelle session',
    sessionPath: path,
    updatedAt: lastMessageAt ?? (Number.isNaN(createdAt) ? updatedAt : createdAt),
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

function parseMessageTimestamp(line: string): number | undefined {
  try {
    const value: unknown = JSON.parse(line)
    if (!isObject(value) || value.type !== 'message' || typeof value.timestamp !== 'string') return undefined
    const timestamp = Date.parse(value.timestamp)
    return Number.isNaN(timestamp) ? undefined : timestamp
  } catch {
    return undefined
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

function parseUserPrompt(line: string): string | undefined {
  try {
    const value: unknown = JSON.parse(line)
    if (!isObject(value) || value.type !== 'message' || !isObject(value.message) || value.message.role !== 'user') return undefined
    const content = textContent(value.message.content)
    if (!content || content.startsWith('/')) return undefined
    return shortenPrompt(content)
  } catch {
    return undefined
  }
}

function textContent(content: unknown): string | undefined {
  if (typeof content === 'string') return content.trim() || undefined
  if (!Array.isArray(content)) return undefined
  const text = content
    .filter((part): part is Record<string, unknown> => isObject(part) && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join(' ')
    .trim()
  return text || undefined
}

function shortenPrompt(prompt: string): string {
  const words = prompt.split(/\s+/)
  return words.length > 8 ? `${words.slice(0, 8).join(' ')}…` : prompt
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFound(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT'
}
