import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Tooltip } from '../../components/Tooltip.tsx'
import type { TodoItem } from '../../../shared/types.ts'
import { getTodos, updateTodos } from '../../api.ts'
import { reorderTodoItems } from './todo-order.ts'

/** Displays and edits the persistent task list for the current workspace. */
export function TodoWidget({ onOpenCountChange, onSendPrompt, onStartSession, workspacePath }: {
  onOpenCountChange: (count: number | null) => void
  onSendPrompt: (message: string) => Promise<void>
  onStartSession: (message: string) => Promise<void>
  workspacePath: string
}) {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [reloadRequest, setReloadRequest] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const dragOriginalTodos = useRef<TodoItem[] | null>(null)
  const dragTodos = useRef<TodoItem[] | null>(null)
  const dragMoved = useRef(false)

  /** Reloads the list when the workspace changes and ignores stale responses. */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setTodos([])
    void getTodos(workspacePath)
      .then((nextTodos) => {
        if (cancelled) return
        setTodos(nextTodos)
        onOpenCountChange(openCount(nextTodos))
      })
      .catch((cause) => {
        if (!cancelled) setError(messageOf(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [onOpenCountChange, reloadRequest, workspacePath])

  /** Persists a new list before replacing the visible state. */
  async function save(nextTodos: TodoItem[]): Promise<boolean> {
    setBusy(true)
    setError('')
    try {
      const savedTodos = await updateTodos(workspacePath, nextTodos)
      setTodos(savedTodos)
      onOpenCountChange(openCount(savedTodos))
      return true
    } catch (cause) {
      setError(messageOf(cause))
      return false
    } finally {
      setBusy(false)
    }
  }

  /** Adds a non-empty task while keeping the input if saving fails. */
  async function addTodo(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const text = newText.trim()
    if (!text) return
    if (await save([...todos, { id: crypto.randomUUID(), text, completed: false }])) setNewText('')
  }

  /** Saves edited text or cancels editing when it has not changed. */
  async function commitEdit(todo: TodoItem): Promise<void> {
    const text = editingText.trim()
    if (!text || busy) return
    if (text === todo.text || await save(todos.map((item) => item.id === todo.id ? { ...item, text } : item))) {
      setEditingId(null)
      setEditingText('')
    }
  }

  function editWithKeyboard(event: KeyboardEvent<HTMLInputElement>, todo: TodoItem): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      void commitEdit(todo)
    } else if (event.key === 'Escape') {
      setEditingId(null)
      setEditingText('')
    }
  }

  /** Permanently removes a task without interrupting the flow with a confirmation. */
  async function removeTodo(todo: TodoItem): Promise<void> {
    await save(todos.filter((item) => item.id !== todo.id))
  }

  /** Starts a drag while retaining the order to restore if saving fails. */
  function beginDrag(event: ReactPointerEvent<HTMLSpanElement>, todoId: string): void {
    if (busy || editingId !== null || startingId !== null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOriginalTodos.current = todos
    dragTodos.current = todos
    dragMoved.current = false
    setDraggedId(todoId)
  }

  /** Visually reorders the list according to the task under the captured pointer. */
  function moveDraggedTodo(event: ReactPointerEvent<HTMLSpanElement>): void {
    if (!draggedId || !dragTodos.current) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-todo-id]')
    const targetId = target?.dataset.todoId
    if (!targetId || targetId === draggedId) return

    const nextTodos = reorderTodoItems(dragTodos.current, draggedId, targetId, event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2)
    if (nextTodos === dragTodos.current) return
    dragTodos.current = nextTodos
    dragMoved.current = true
    setTodos(nextTodos)
  }

  /** Persists the dropped order and restores the previous order if writing fails. */
  async function finishDrag(event: ReactPointerEvent<HTMLSpanElement>): Promise<void> {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const nextTodos = dragTodos.current
    const previousTodos = dragOriginalTodos.current
    const shouldSave = dragMoved.current
    setDraggedId(null)
    dragTodos.current = null
    dragOriginalTodos.current = null
    dragMoved.current = false
    if (!shouldSave || !nextTodos || !previousTodos || await save(nextTodos)) return
    setTodos(previousTodos)
    onOpenCountChange(openCount(previousTodos))
  }

  /** Cancels the current drag and restores the initial order without persisting it. */
  function cancelDrag(): void {
    if (dragOriginalTodos.current) setTodos(dragOriginalTodos.current)
    setDraggedId(null)
    dragTodos.current = null
    dragOriginalTodos.current = null
    dragMoved.current = false
  }

  /** Opens a new session with the task text ready to edit. */
  async function startSession(todo: TodoItem): Promise<void> {
    setStartingId(todo.id)
    try {
      await onStartSession(todo.text)
    } finally {
      setStartingId(null)
    }
  }

  /** Opens a new session and sends the task text immediately. */
  async function sendPrompt(todo: TodoItem): Promise<void> {
    setStartingId(todo.id)
    try {
      await onSendPrompt(todo.text)
    } finally {
      setStartingId(null)
    }
  }

  const visibleTodos = todos.filter((todo) => !todo.completed)
  const remaining = visibleTodos.length

  return <>
    <header className="widget-header">
      <div className="todo-heading"><strong>Todo</strong><span>{loading ? 'Loading…' : remaining === 0 ? 'All clear' : `${remaining} task${remaining === 1 ? '' : 's'} to do`}</span></div>
      <span className="todo-count" aria-label={`${remaining} tasks remaining`}>{loading ? '—' : remaining}</span>
    </header>
    <div className="widget-content todo-content">
      {loading ? <div aria-label="Loading tasks" className="todo-skeleton" role="status"><i /><i /><i /></div> : <>
        {error && <div className="todo-error" role="alert"><span>{error}</span><button onClick={() => setReloadRequest((current) => current + 1)} type="button">Retry</button></div>}
        {visibleTodos.length === 0 && !error ? <div className="todo-empty"><strong>No tasks</strong><span>Write down an idea to pick up later in this workspace.</span></div> : <ul className="todo-list">
          {visibleTodos.map((todo) => <li className={draggedId === todo.id ? 'dragging' : undefined} data-todo-id={todo.id} key={todo.id}>
            <Tooltip label="Move"><span
              aria-hidden="true"
              className="todo-drag"
              onPointerCancel={cancelDrag}
              onPointerDown={(event) => beginDrag(event, todo.id)}
              onPointerMove={moveDraggedTodo}
              onPointerUp={(event) => void finishDrag(event)}
            >⠿</span></Tooltip>
            <input aria-label={`Mark “${todo.text}” as complete`} checked={false} disabled={busy} onChange={() => void save(todos.map((item) => item.id === todo.id ? { ...item, completed: true } : item))} type="checkbox" />
            {editingId === todo.id ? <input
              aria-label={`Edit “${todo.text}”`}
              autoFocus
              className="todo-edit"
              disabled={busy}
              maxLength={500}
              onBlur={() => void commitEdit(todo)}
              onChange={(event) => setEditingText(event.target.value)}
              onKeyDown={(event) => editWithKeyboard(event, todo)}
              value={editingText}
            /> : <Tooltip label="Edit"><button className="todo-text" disabled={busy || startingId !== null} onClick={() => { setEditingId(todo.id); setEditingText(todo.text) }} type="button">{todo.text}</button></Tooltip>}
            <Tooltip label="Open a new session"><button aria-label={`Open a new session with “${todo.text}”`} className="todo-start" disabled={busy || editingId !== null || startingId !== null} onClick={() => void startSession(todo)} type="button">{startingId === todo.id ? '…' : '↗'}</button></Tooltip>
            <Tooltip label="Open a session and send the prompt"><button aria-label={`Open a new session and send “${todo.text}”`} className="todo-send" disabled={busy || editingId !== null || startingId !== null} onClick={() => void sendPrompt(todo)} type="button">{startingId === todo.id ? '…' : '↑'}</button></Tooltip>
            <Tooltip label="Delete"><button aria-label={`Delete “${todo.text}”`} className="todo-delete" disabled={busy || startingId !== null} onClick={() => void removeTodo(todo)} type="button">×</button></Tooltip>
          </li>)}
        </ul>}
      </>}
    </div>
    <footer className="widget-footer">
      <form className="todo-add" onSubmit={(event) => void addTodo(event)}>
        <input aria-label="New task" disabled={busy || loading} maxLength={500} onChange={(event) => setNewText(event.target.value)} placeholder="Add a task to this workspace…" value={newText} />
        <Tooltip label="Add"><button aria-label="Add task" disabled={busy || loading || !newText.trim()} type="submit">+</button></Tooltip>
      </form>
    </footer>
  </>
}



function openCount(todos: TodoItem[]): number {
  return todos.filter((todo) => !todo.completed).length
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
