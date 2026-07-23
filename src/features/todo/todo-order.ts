import type { TodoItem } from '../../../shared/types.ts'

/** Déplace une tâche avant ou après une autre sans altérer le contenu des éléments. */
export function reorderTodoItems(todos: TodoItem[], movedId: string, targetId: string, placeAfter: boolean): TodoItem[] {
  if (movedId === targetId || !todos.some(({ id }) => id === movedId) || !todos.some(({ id }) => id === targetId)) return todos

  const reordered = [...todos]
  const [movedTodo] = reordered.splice(reordered.findIndex(({ id }) => id === movedId), 1)
  const targetIndex = reordered.findIndex(({ id }) => id === targetId)
  reordered.splice(targetIndex + Number(placeAfter), 0, movedTodo)

  return reordered.every((todo, index) => todo.id === todos[index]?.id) ? todos : reordered
}
