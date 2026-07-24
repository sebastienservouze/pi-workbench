# Project architecture

Pi Workbench separates the interface, local HTTP API, and Pi processes so that restarting the frontend or backend does not close active sessions.

```text
React browser
    │ HTTP + SSE
    ▼
server/backend.ts
    │ JSON Lines over local TCP
    ▼
server/manager.ts
    │ Pi public RPC
    ▼
pi --mode rpc process
```

## Frontend

`src/App.tsx` remains the cross-cutting orchestrator: it selects the workspace and session, receives the SSE stream, synchronizes snapshots, and connects the panels. Area-specific logic and rendering live in `src/features/`:

- `composer/` — input, commands, and image preparation;
- `conversation/` — history, activity, usage, and tool calls;
- `dialogs/` — extension questionnaires and dialogs;
- `git/` — Git widget state and diffs;
- `right-sidebar/` — integrated widgets, rail actions, collapse state, and resizing;
- `workspace/` — directory selection and recent sessions.

Each substantial feature contains a README describing its boundary, data flow, constraints, and focused tests.

`src/api.ts` is the frontend's only HTTP boundary. A component does not communicate directly with the manager or a Pi process.

`src/App.css` orders the stylesheets. Global and responsive rules live in `src/styles/`; feature-specific rules are colocated with their feature.

## Backend and manager

`server/backend.ts` exposes the web API, validates HTTP requests, serves the build, and broadcasts SSE events. Domain behavior for Git, quotas, terminal commands, and todos lives in `server/features/`; route definitions remain in the backend. Other neighboring modules provide workspace files, recent sessions, and system integrations.

`server/manager.ts` is the sole owner of `pi --mode rpc` processes. `server/manager-client.ts` connects the backend to the manager through a local JSON Lines protocol. This responsibility must not move to the backend: the manager must survive its restart. Backend capabilities that need Pi communicate through this client rather than owning a process.

## Shared contracts

`shared/` contains types and protocols exchanged between layers. HTTP, SSE, manager, and RPC formats are observable contracts: an internal move must not change them implicitly.

## Main flows

1. The frontend calls a function from `src/api.ts`.
2. `server/backend.ts` validates the request and handles local capabilities directly, or forwards it to the manager.
3. The manager creates, reopens, or commands the relevant Pi process.
4. Pi events travel back to the backend and then to the browser through SSE.
5. `App` updates cross-cutting state and delegates rendering to the relevant feature.

## Where to make a change

- New tool presentation: `src/features/conversation/tool-calls.ts`, then its focused test.
- New conversation or composer behavior: the relevant feature, without growing `App` when the state is not cross-cutting.
- New right widget: read [`../src/features/right-sidebar/README.md`](../src/features/right-sidebar/README.md).
- Existing local capability: its module under `server/features/`, after reading [`../server/features/README.md`](../server/features/README.md).
- New local route: `server/backend.ts`, then `src/api.ts` if the frontend uses it.
- Pi process lifecycle: `server/manager.ts` or `server/pi-process.ts`, after explicit approval because of the interruption risk.
