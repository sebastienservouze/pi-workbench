# Terminal backend capability

`terminal.ts` runs one isolated, non-interactive command in a validated workspace. Execution is limited to ten minutes and one megabyte of buffered output.

HTTP paths, command validation, and working-directory resolution remain in `server/backend.ts`. Main coverage: `test/terminal.test.ts`.
