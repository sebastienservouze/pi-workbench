import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { SessionSummary } from '../shared/types.ts'

export interface StoredSession {
  id: string
  cwd: string
  name: string
}

const defaultRegistryPath = process.env.PI_LIVECRAFT_SESSION_REGISTRY
  ?? process.env.PI_WORKBENCH_SESSION_REGISTRY
  ?? join(homedir(), '.pi-livecraft', 'sessions.json')

export async function loadSessionRegistry(path = defaultRegistryPath): Promise<StoredSession[]> {
  try {
    return parseSessionRegistry(await readFile(path, 'utf8'))
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
}

export async function saveSessionRegistry(sessions: SessionSummary[], path = defaultRegistryPath): Promise<void> {
  const storedSessions = sessions.map(({ id, cwd, name }) => ({ id, cwd, name }))
  const temporaryPath = `${path}.${process.pid}.tmp`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(temporaryPath, `${JSON.stringify(storedSessions, null, 2)}\n`, { mode: 0o600 })
  await rename(temporaryPath, path)
}

export function parseSessionRegistry(content: string): StoredSession[] {
  const value: unknown = JSON.parse(content)
  if (!Array.isArray(value) || !value.every(isStoredSession)) throw new Error('Invalid Pi Livecraft session registry')
  if (new Set(value.map(({ id }) => id)).size !== value.length) throw new Error('Duplicate session in Pi Livecraft registry')
  return value
}

function isStoredSession(value: unknown): value is StoredSession {
  return isObject(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.cwd === 'string' && value.cwd.length > 0
    && typeof value.name === 'string' && value.name.length > 0
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFound(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT'
}
