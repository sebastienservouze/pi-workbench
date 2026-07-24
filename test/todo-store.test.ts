import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadWorkspaceTodos, parseTodoItems, parseTodoStore, saveWorkspaceTodos } from '../server/features/todos/todo-store.ts'

const todos = [
  { id: 'first', text: 'Première tâche', completed: false },
  { id: 'second', text: 'Tâche terminée', completed: true },
]

test('persists todo lists independently for each workspace', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-livecraft-todos-'))
  const path = join(directory, 'todos.json')
  try {
    await Promise.all([
      saveWorkspaceTodos('/workspace/a', todos, path),
      saveWorkspaceTodos('/workspace/b', [{ id: 'other', text: 'Autre tâche', completed: false }], path),
    ])

    assert.deepEqual(await loadWorkspaceTodos('/workspace/a', path), todos)
    assert.deepEqual(await loadWorkspaceTodos('/workspace/b', path), [{ id: 'other', text: 'Autre tâche', completed: false }])
    assert.equal((await readFile(path, 'utf8')).endsWith('\n'), true)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('validates todo stores and rejects duplicate or empty items', () => {
  assert.deepEqual(parseTodoStore(JSON.stringify({ workspaces: { '/workspace': todos } })).workspaces['/workspace'], todos)
  assert.throws(() => parseTodoItems([{ id: 'same', text: 'A', completed: false }, { id: 'same', text: 'B', completed: false }]), /Duplicate todo item/)
  assert.throws(() => parseTodoItems([{ id: 'empty', text: '  ', completed: false }]), /Invalid workspace todo list/)
})
