import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { TodoItem } from '../../../shared/types.ts'
import { getTodos, updateTodos } from '../../api.ts'
import { reorderTodoItems } from './todo-order.ts'

/** Affiche et modifie la liste de tâches persistante du workspace courant. */
export function TodoWidget({ onOpenCountChange, onStartSession, workspacePath }: {
  onOpenCountChange: (count: number | null) => void
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

  /** Recharge la liste lorsque le workspace change et ignore les réponses devenues obsolètes. */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setTodos([])
    onOpenCountChange(null)
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

  /** Persiste une nouvelle liste avant de remplacer l’état visible. */
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

  /** Ajoute une tâche non vide tout en conservant la saisie si la sauvegarde échoue. */
  async function addTodo(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const text = newText.trim()
    if (!text) return
    if (await save([...todos, { id: crypto.randomUUID(), text, completed: false }])) setNewText('')
  }

  /** Enregistre le texte édité ou annule l’édition lorsqu’il n’a pas changé. */
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

  /** Supprime définitivement une tâche sans interrompre le flux par une confirmation. */
  async function removeTodo(todo: TodoItem): Promise<void> {
    await save(todos.filter((item) => item.id !== todo.id))
  }

  /** Initialise un déplacement tout en conservant l’ordre à restaurer en cas d’échec. */
  function beginDrag(event: ReactPointerEvent<HTMLSpanElement>, todoId: string): void {
    if (busy || editingId !== null || startingId !== null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOriginalTodos.current = todos
    dragTodos.current = todos
    dragMoved.current = false
    setDraggedId(todoId)
  }

  /** Réordonne visuellement la liste selon la tâche survolée par le pointeur capturé. */
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

  /** Persiste l’ordre déposé et rétablit l’ordre précédent si l’écriture échoue. */
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

  /** Annule le déplacement en cours et restaure l’ordre initial sans le persister. */
  function cancelDrag(): void {
    if (dragOriginalTodos.current) setTodos(dragOriginalTodos.current)
    setDraggedId(null)
    dragTodos.current = null
    dragOriginalTodos.current = null
    dragMoved.current = false
  }

  /** Lance une nouvelle session avec le texte de la tâche comme premier message. */
  async function startSession(todo: TodoItem): Promise<void> {
    setStartingId(todo.id)
    try {
      await onStartSession(todo.text)
    } finally {
      setStartingId(null)
    }
  }

  const visibleTodos = todos.filter((todo) => !todo.completed)
  const remaining = visibleTodos.length

  return <>
    <header className="widget-header">
      <div><strong>À faire</strong><span>{loading ? 'Chargement…' : `${remaining} restante${remaining > 1 ? 's' : ''}`}</span></div>
    </header>
    <div className="widget-content todo-content">
      {loading ? <div aria-label="Chargement des tâches" className="todo-skeleton" role="status"><i /><i /><i /></div> : <>
        {error && <div className="todo-error" role="alert"><span>{error}</span><button onClick={() => setReloadRequest((current) => current + 1)} type="button">Réessayer</button></div>}
        {visibleTodos.length === 0 && !error ? <div className="todo-empty"><strong>Aucune tâche</strong><span>Notez ici une idée à reprendre dans ce workspace.</span></div> : <ul className="todo-list">
          {visibleTodos.map((todo) => <li className={draggedId === todo.id ? 'dragging' : undefined} data-todo-id={todo.id} key={todo.id}>
            <span
              aria-hidden="true"
              className="todo-drag"
              onPointerCancel={cancelDrag}
              onPointerDown={(event) => beginDrag(event, todo.id)}
              onPointerMove={moveDraggedTodo}
              onPointerUp={(event) => void finishDrag(event)}
              title="Déplacer"
            >⠿</span>
            <input aria-label={`Marquer « ${todo.text} » comme terminée`} checked={false} disabled={busy} onChange={() => void save(todos.map((item) => item.id === todo.id ? { ...item, completed: true } : item))} type="checkbox" />
            {editingId === todo.id ? <input
              aria-label={`Modifier « ${todo.text} »`}
              autoFocus
              className="todo-edit"
              disabled={busy}
              maxLength={500}
              onBlur={() => void commitEdit(todo)}
              onChange={(event) => setEditingText(event.target.value)}
              onKeyDown={(event) => editWithKeyboard(event, todo)}
              value={editingText}
            /> : <button className="todo-text" disabled={busy || startingId !== null} onClick={() => { setEditingId(todo.id); setEditingText(todo.text) }} title="Modifier" type="button">{todo.text}</button>}
            <button aria-label={`Démarrer une session avec « ${todo.text} »`} className="todo-start" disabled={busy || editingId !== null || startingId !== null} onClick={() => void startSession(todo)} title="Démarrer une session avec cette tâche" type="button">{startingId === todo.id ? '…' : '↗'}</button>
            <button aria-label={`Supprimer « ${todo.text} »`} className="todo-delete" disabled={busy || startingId !== null} onClick={() => void removeTodo(todo)} title="Supprimer" type="button">×</button>
          </li>)}
        </ul>}
      </>}
    </div>
    <footer className="widget-footer">
      <form className="todo-add" onSubmit={(event) => void addTodo(event)}>
        <input aria-label="Nouvelle tâche" disabled={busy || loading} maxLength={500} onChange={(event) => setNewText(event.target.value)} placeholder="Ajouter une tâche…" value={newText} />
        <button aria-label="Ajouter la tâche" disabled={busy || loading || !newText.trim()} title="Ajouter" type="submit">+</button>
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
