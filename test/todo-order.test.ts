import assert from 'node:assert/strict'
import test from 'node:test'
import { reorderTodoItems } from '../src/features/todo/todo-order.ts'

const todos = [
  { id: 'first', text: 'Première tâche', completed: false },
  { id: 'completed', text: 'Tâche terminée', completed: true },
  { id: 'last', text: 'Dernière tâche', completed: false },
]

test('reorders todos before or after a drop target', () => {
  assert.deepEqual(reorderTodoItems(todos, 'last', 'first', false).map(({ id }) => id), ['last', 'first', 'completed'])
  assert.deepEqual(reorderTodoItems(todos, 'first', 'last', true).map(({ id }) => id), ['completed', 'last', 'first'])
  assert.equal(reorderTodoItems(todos, 'missing', 'first', false), todos)
})
