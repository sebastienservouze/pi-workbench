# Agent instructions

## Architecture and boundaries

- Read [`docs/architecture.md`](docs/architecture.md) before a cross-cutting change or moving a module.
- The React frontend communicates with the backend only through `src/api.ts`.
- `src/App.tsx` only orchestrates cross-cutting state; put area-specific rendering and logic in `src/features/<feature>/`.
- Colocate feature-specific CSS with its feature. Reserve `src/styles/` for global and responsive rules, and keep `src/App.css` as the ordered entry point.
- `server/backend.ts` owns the web API and SSE stream. It can restart without interrupting Pi.
- `server/manager.ts` is the sole owner of `pi --mode rpc` processes; do not move that responsibility into the backend.
- Use Pi's public RPC protocol. Do not read its internal files to reproduce a capability already exposed through RPC.
- The application is local and listens only on `127.0.0.1`. Do not broaden this exposure without explicit authentication and scoping.
- Do not add a database, frontend router, state manager, or UI library without a demonstrated need.

## Self-modification

Pi Workbench is designed to be modified by the agents using it. Before editing, analyze the existing flow, reuse repository conventions, and look for the root cause rather than working around a symptom.

- Prefer the smallest change that solves the need, without a new dependency or speculative abstraction.
- Preserve existing contracts, APIs, data formats, and expected behavior whenever possible.
- Inspect callers, tests, and neighboring components before changing a shared function.
- Validate changes with relevant checks and do not mix them with pre-existing repository changes.
- If a change introduces a compatibility break, clearly report it before applying it: describe the removed or changed behavior, the expected impact, and how to migrate.
- `server/manager.ts` owns the `pi --mode rpc` processes. It may be changed when necessary, but ask for approval first: changing or restarting the manager can interrupt the Pi connection and current response. The session can normally be recovered through Pi history and resumed.
- Do not move Pi process management elsewhere or modify the RPC protocol without demonstrated necessity.

## Commands

```bash
npm install
npm run dev:manager
npm run dev:backend
npm run dev:frontend
npm run typecheck
npm run lint
npm run build
```

Tests:

```bash
# A specific test
npm test -- --test-name-pattern="exposes current Pi commands over RPC" test/pi-rpc.integration.test.ts

# A file
npm test -- test/pi-rpc.integration.test.ts

# The full suite
npm test
```

The integration test expects a configured `pi` command and the `/agent` extension to be available.

## Pi documentation

Pi documentation is available locally at `$(npm root -g)/@earendil-works/pi-coding-agent/docs/`.

## Tool call presentations

Read [`docs/tool-call-presentations.md`](docs/tool-call-presentations.md) before creating or changing a tool call display.

## Right sidebar widgets

Read [`docs/right-sidebar-widgets.md`](docs/right-sidebar-widgets.md) before creating or changing a right sidebar widget.

## Conventions

- Write identifiers, filenames, and code in English.
- Keep code spacious, simple, and readable; give variables explicit names.
- Document every application function longer than four lines with English JSDoc, except obvious utility functions (type guards, conversions, formatting, or local parsing). Describe its purpose, contract, invariant, side effect, or non-obvious rationale; never paraphrase the code.
- Keep TypeScript strict and run Oxlint before proposing a change.
- Use commits in the `<gitmoji> concise imperative subject` format, without a conventional prefix such as `feat:`.
- Never claim a test or check that was not actually run.
