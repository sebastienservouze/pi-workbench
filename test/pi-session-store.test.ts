import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { listRecentPiSessions } from '../server/pi-session-store.ts'

test('lists the latest Pi sessions for one working directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-sessions-'))
  const sessions = join(directory, 'project')
  await mkdir(sessions)
  await writeSession(join(sessions, 'older.jsonl'), '/workspace', 'older', 'Older session')
  await writeSession(join(sessions, 'newer.jsonl'), '/workspace', 'newer', 'Newer session', 'Renamed session')
  await writeSession(join(sessions, 'other.jsonl'), '/another-workspace', 'other', 'Other session')

  const recent = await listRecentPiSessions('/workspace', 10, directory)

  assert.deepEqual(recent.map(({ id, name }) => ({ id, name })), [
    { id: 'newer', name: 'Renamed session' },
    { id: 'older', name: 'Older session' },
  ])
})

test('uses the first non-command user prompt when a session has no name', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-sessions-'))
  const path = join(directory, 'unnamed.jsonl')
  await writeFile(path, [
    JSON.stringify({ type: 'session', version: 3, id: 'unnamed', timestamp: '2026-07-19T10:00:00.000Z', cwd: '/workspace' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: '/agent' } }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'One two three four five six seven eight nine' }] } }),
  ].join('\n'))

  const [recent] = await listRecentPiSessions('/workspace', 10, directory)

  assert.equal(recent.name, 'One two three four five six seven eight…')
})

test('uses a placeholder when a session has no name or user prompt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-sessions-'))
  const path = join(directory, 'unnamed.jsonl')
  await writeFile(path, JSON.stringify({ type: 'session', version: 3, id: 'unnamed', timestamp: '2026-07-19T10:00:00.000Z', cwd: '/workspace' }))

  const [recent] = await listRecentPiSessions('/workspace', 10, directory)

  assert.equal(recent.name, 'Nouvelle session')
})

async function writeSession(path: string, cwd: string, id: string, name: string, renamedName?: string): Promise<void> {
  const timestamp = id === 'newer' ? '2026-07-19T10:00:00.000Z' : '2026-07-19T09:00:00.000Z'
  await writeFile(path, [
    JSON.stringify({ type: 'session', version: 3, id, timestamp, cwd }),
    JSON.stringify({ type: 'session_info', name }),
    ...(renamedName ? [JSON.stringify({ type: 'session_info', name: renamedName })] : []),
  ].join('\n'))
}
