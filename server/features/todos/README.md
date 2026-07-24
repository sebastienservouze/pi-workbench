# Todos backend capability

`todo-store.ts` validates and atomically persists ordered task lists by canonical workspace path. Writes to the shared JSON store are serialized and the file is created with user-only permissions.

HTTP paths, request validation, and working-directory resolution remain in `server/backend.ts`. Main coverage: `test/todo-store.test.ts`.
