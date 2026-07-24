import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { TodoItem } from '../../../shared/types.ts'

interface TodoStore {
  workspaces: Record<string, TodoItem[]>
}

const defaultTodoStorePath = process.env.PI_LIVECRAFT_TODO_STORE
  ?? process.env.PI_WORKBENCH_TODO_STORE
  ?? join(homedir(), '.pi-livecraft', 'todos.json')
const maxTodoCount = 500
const maxTodoTextLength = 500
let saveQueue = Promise.resolve()

/** Loads tasks associated with a workspace without exposing tasks from other directories. */
export async function loadWorkspaceTodos(workspacePath: string, path = defaultTodoStorePath): Promise<TodoItem[]> {
  try {
    return parseTodoStore(await readFile(path, 'utf8')).workspaces[workspacePath] ?? []
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
}

/** Atomically replaces a workspace's tasks by serializing writes to the shared registry. */
export function saveWorkspaceTodos(workspacePath: string, todos: TodoItem[], path = defaultTodoStorePath): Promise<void> {
  const validatedTodos = parseTodoItems(todos)
  const operation = saveQueue.then(async () => {
    let store: TodoStore
    try {
      store = parseTodoStore(await readFile(path, 'utf8'))
    } catch (error) {
      if (!isNotFound(error)) throw error
      store = { workspaces: {} }
    }

    store.workspaces[workspacePath] = validatedTodos
    const temporaryPath = `${path}.${process.pid}.tmp`
    await mkdir(dirname(path), { recursive: true })
    await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
    await rename(temporaryPath, path)
  })
  saveQueue = operation.catch(() => undefined)
  return operation
}

export function parseTodoItems(value: unknown): TodoItem[] {
  if (!Array.isArray(value) || value.length > maxTodoCount || !value.every(isTodoItem)) throw new Error('Invalid workspace todo list')
  if (new Set(value.map(({ id }) => id)).size !== value.length) throw new Error('Duplicate todo item')
  return value.map((todo) => ({ ...todo, text: todo.text.trim() }))
}

export function parseTodoStore(content: string): TodoStore {
  const value: unknown = JSON.parse(content)
  if (!isObject(value) || !isObject(value.workspaces)) throw new Error('Invalid Pi Livecraft todo store')
  return {
    workspaces: Object.fromEntries(Object.entries(value.workspaces).map(([workspacePath, todos]) => [workspacePath, parseTodoItems(todos)])),
  }
}

function isTodoItem(value: unknown): value is TodoItem {
  return isObject(value)
    && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 100
    && typeof value.text === 'string' && value.text.trim().length > 0 && value.text.length <= maxTodoTextLength
    && typeof value.completed === 'boolean'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFound(error: unknown): boolean {
  return isObject(error) && error.code === 'ENOENT'
}
