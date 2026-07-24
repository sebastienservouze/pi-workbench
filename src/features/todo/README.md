# Todo frontend

This feature edits the workspace task list, preserves explicit ordering, reports the open count to the right rail, and can start a session from a task. All persistence flows through `src/api.ts` to the todo backend capability.

Task identifiers and ordering remain stable across edits. Main coverage: `test/todo-order.test.ts` and `test/todo-store.test.ts`.
