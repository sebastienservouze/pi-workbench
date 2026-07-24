# Agent instructions

## Architecture and boundaries

- Read [`docs/architecture.md`](docs/architecture.md) before a cross-cutting change or moving a module; use [`docs/README.md`](docs/README.md) to find focused guides.
- The React frontend communicates with the backend only through `src/api.ts`.
- `src/App.tsx` orchestrates cross-cutting state. Area-specific rendering and logic belong in `src/features/<feature>/`.
- Colocate feature CSS. Reserve `src/styles/` for global and responsive rules; `src/App.css` remains the ordered entry point.
- `server/backend.ts` owns the web API and SSE stream and can restart without interrupting Pi.
- `server/manager.ts` is the sole owner of `pi --mode rpc` processes. Ask before changing or restarting it because this can interrupt the current connection and response; history can normally resume the session.
- Use Pi's public RPC protocol. Do not read internal files to reproduce an RPC capability or move process ownership into the backend.
- The application listens only on `127.0.0.1`. Do not broaden exposure without explicit authentication and scoping.
- Do not add a database, frontend router, state manager, or UI library without demonstrated need.

## Working rules

Pi Workbench is designed to be modified by the agents using it. Trace the existing flow and callers, then make the smallest compatible change at the owning boundary.

- Reuse repository patterns and preserve observable APIs, protocols, and data formats.
- Keep validation at trust boundaries and avoid speculative dependencies or abstractions.
- Do not mix agent changes with pre-existing work.
- Before a compatibility break, report the changed behavior, impact, and migration.
- Validate with the narrowest relevant check. Never claim a check that was not run.

## Commands

```bash
npm run dev                 # manager, backend, and frontend
npm run dev:manager         # individual development processes
npm run dev:backend
npm run dev:frontend
npm run typecheck
npm run lint
npm run build
npm test -- test/file.test.ts
npm test -- --test-name-pattern="test name" test/file.test.ts
npm test                    # full suite
```

The integration test requires a configured `pi` command and the `/agent` extension. Pi documentation is installed at `$(npm root -g)/@earendil-works/pi-coding-agent/docs/`.

## Focused documentation

- [Frontend feature map](src/features/README.md)
- [Tool call presentations](docs/tool-call-presentations.md)
- [Commands and shortcuts](src/features/commands/README.md)
- [Settings and preferences](src/features/settings/README.md)
- [Right sidebar widgets](src/features/right-sidebar/README.md)
- [Backend capabilities](server/features/README.md)

## Conventions

- Write identifiers, filenames, and code in English.
- Keep code spacious and explicit.
- Document every application function longer than four lines with English JSDoc, except obvious type guards, conversions, formatting, or local parsing. Explain purpose, contract, invariant, side effect, or rationale rather than paraphrasing code.
- Keep TypeScript strict and run Oxlint before proposing a change.
- Commit as `<gitmoji> concise imperative subject`, without a conventional prefix.
