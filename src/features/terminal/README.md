# Terminal frontend

This feature runs one non-interactive command in the selected workspace and keeps its current output while mounted. It calls the terminal backend only through `src/api.ts`.

Commands do not share shell state, accept interactive input, or emulate a terminal. Backend limits define execution time and output size. Main coverage: `test/terminal.test.ts`.
