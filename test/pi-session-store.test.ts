import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { listRecentPiSessions } from '../server/pi-session-store.ts'

test('sorts Pi sessions by their last message timestamp', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-sessions-'))
  const sessions = join(directory, 'project')
  await mkdir(sessions)
  await writeSession(join(sessions, 'older.jsonl'), '/workspace', 'older', 'Older session', undefined, '2026-07-19T11:00:00.000Z')
  await writeSession(join(sessions, 'newer.jsonl'), '/workspace', 'newer', 'Newer session', 'Renamed session')
  await writeSession(join(sessions, 'other.jsonl'), '/another-workspace', 'other', 'Other session')

  const recent = await listRecentPiSessions('/workspace', directory)

  assert.deepEqual(recent.map(({ id, name }) => ({ id, name })), [
    { id: 'older', name: 'Older session' },
    { id: 'newer', name: 'Renamed session' },
  ])
})

test('returns every session in the working directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-sessions-'))
  await Promise.all(Array.from({ length: 11 }, (_, index) =>
    writeSession(join(directory, `${index}.jsonl`), '/workspace', String(index), `Session ${index}`),
  ))

  const recent = await listRecentPiSessions('/workspace', directory)

  assert.equal(recent.length, 11)
})

test('uses the first non-command user prompt when a session has no name', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-sessions-'))
  const path = join(directory, 'unnamed.jsonl')
  await writeFile(path, [
    JSON.stringify({ type: 'session', version: 3, id: 'unnamed', timestamp: '2026-07-19T10:00:00.000Z', cwd: '/workspace' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: '/agent' } }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'One two three four five six seven eight nine' }] } }),
  ].join('\n'))

  const [recent] = await listRecentPiSessions('/workspace', directory)

  assert.equal(recent.name, 'One two three four five six seven eight…')
})

test('uses a placeholder when a session has no name or user prompt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-sessions-'))
  const path = join(directory, 'unnamed.jsonl')
  await writeFile(path, JSON.stringify({ type: 'session', version: 3, id: 'unnamed', timestamp: '2026-07-19T10:00:00.000Z', cwd: '/workspace' }))

  const [recent] = await listRecentPiSessions('/workspace', directory)

  assert.equal(recent.name, 'New session')
})

async function writeSession(path: string, cwd: string, id: string, name: string, renamedName?: string, lastMessageTimestamp?: string): Promise<void> {
  const timestamp = id === 'newer' ? '2026-07-19T10:00:00.000Z' : '2026-07-19T09:00:00.000Z'
  const messageTimestamp = lastMessageTimestamp ?? timestamp
  await writeFile(path, [
    JSON.stringify({ type: 'session', version: 3, id, timestamp, cwd }),
    JSON.stringify({ type: 'session_info', name }),
    JSON.stringify({ type: 'message', timestamp: messageTimestamp, message: { role: 'user', content: name } }),
    ...(renamedName ? [JSON.stringify({ type: 'session_info', name: renamedName })] : []),
  ].join('\n'))
}
