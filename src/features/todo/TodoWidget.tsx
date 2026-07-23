import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { TodoItem } from '../../../shared/types.ts'
import { getTodos, updateTodos } from '../../api.ts'

/** Affiche et modifie la liste de tâches persistante du workspace courant. */
export function TodoWidget({ onOpenCountChange, workspacePath }: {
  onOpenCountChange: (count: number | null) => void
  workspacePath: string
}) {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [reloadRequest, setReloadRequest] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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

  /** Supprime définitivement une tâche après confirmation explicite. */
  async function removeTodo(todo: TodoItem): Promise<void> {
    if (!window.confirm(`Supprimer « ${todo.text} » ?`)) return
    await save(todos.filter((item) => item.id !== todo.id))
  }

  const remaining = openCount(todos)

  return <>
    <header className="widget-header">
      <div><strong>À faire</strong><span>{loading ? 'Chargement…' : `${remaining} restante${remaining > 1 ? 's' : ''}`}</span></div>
    </header>
    <div className="widget-content todo-content">
      {loading ? <div aria-label="Chargement des tâches" className="todo-skeleton" role="status"><i /><i /><i /></div> : <>
        {error && <div className="todo-error" role="alert"><span>{error}</span><button onClick={() => setReloadRequest((current) => current + 1)} type="button">Réessayer</button></div>}
        {todos.length === 0 && !error ? <div className="todo-empty"><strong>Aucune tâche</strong><span>Notez ici une idée à reprendre dans ce workspace.</span></div> : <ul className="todo-list">
          {todos.map((todo) => <li className={todo.completed ? 'completed' : undefined} key={todo.id}>
            <input aria-label={`Marquer « ${todo.text} » comme ${todo.completed ? 'à faire' : 'terminée'}`} checked={todo.completed} disabled={busy} onChange={() => void save(todos.map((item) => item.id === todo.id ? { ...item, completed: !item.completed } : item))} type="checkbox" />
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
            /> : <button className="todo-text" disabled={busy} onClick={() => { setEditingId(todo.id); setEditingText(todo.text) }} title="Modifier" type="button">{todo.text}</button>}
            <button aria-label={`Supprimer « ${todo.text} »`} className="todo-delete" disabled={busy} onClick={() => void removeTodo(todo)} title="Supprimer" type="button">×</button>
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
