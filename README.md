<div align="center">

# Pi Workbench

**Build with Pi. Rebuild the workbench while it is running.**

A local, fork-first control room for parallel [Pi](https://github.com/earendil-works/pi) sessions.

[![Version](https://img.shields.io/github/package-json/v/sebastienservouze/pi-workbench?style=flat-square&label=version)](package.json)
[![License](https://img.shields.io/github/license/sebastienservouze/pi-workbench?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/sebastienservouze/pi-workbench?style=flat-square&logo=github)](https://github.com/sebastienservouze/pi-workbench/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/sebastienservouze/pi-workbench?style=flat-square&logo=github)](https://github.com/sebastienservouze/pi-workbench/network/members)

</div>

<!--
  HERO MEDIA — keep one strong visual, not both.

  Screenshot:
  <p align="center"><img src="./docs/assets/pi-workbench.png" alt="Pi Workbench interface" width="1200" /></p>

  Demo GIF:
  <p align="center"><img src="./docs/assets/pi-workbench-demo.gif" alt="Editing Pi Workbench from a live Pi session" width="1200" /></p>
-->

Pi Workbench is not a one-size-fits-all AI client. It is a working base meant to be **forked, stripped down, extended, and made personal**.

The defining loop is simple: open Pi Workbench, ask Pi to change Pi Workbench, and watch the interface evolve around the session you are already using. Vite refreshes the frontend, Node watches the local services, and the manager keeps Pi sessions alive through frontend and backend restarts.

> The interface is part of the workspace—not a fixed product wrapped around it.

## Why it feels different

### Shape the tool while using the tool

The agent can inspect and modify the application from inside an active session. Change a panel, refine a tool call, add a shortcut, or build a workflow-specific widget without leaving the workbench.

Most frontend changes appear immediately. Backend changes restart automatically without closing the active Pi process. The result is a tight feedback loop where the product can adapt to the work instead of forcing the work into a predefined UI.

### Turn a note into the next session

Todos are stored per workspace, so ideas do not disappear into chat history. Add, edit, reorder, and complete tasks while a session is running, then click **↗** on a task to:

1. create a new session in the same workspace;
2. open it immediately;
3. prefill the composer with the task as the prompt.

You stay in control of the final prompt before sending it. Direct submission from the todo is the natural next step, but is not implemented yet.

### Keep the whole coding loop close

- **Parallel sessions** — create, switch, and reopen Pi sessions without tying them to the browser lifecycle.
- **Live execution** — follow responses, thinking activity, usage, tool calls, and extension dialogs as they happen.
- **Git workspace** — inspect status, diffs, touched files, and unpushed commits; commit, push, or revert without changing context.
- **Focused side tools** — keep todos, provider quotas, session analysis, and bounded workspace commands one click away.
- **Pi-native controls** — use the models, thinking levels, agents, and commands exposed by Pi.
- **Personal controls** — command palette, editable shortcuts, persistent drafts, resizable panels, and light or dark themes.

## Run it

Pi Workbench is designed to run in development mode. You need:

- Node.js 24 or newer;
- npm;
- a configured `pi` command.

```bash
git clone https://github.com/sebastienservouze/pi-workbench.git
cd pi-workbench
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). `Ctrl+C` stops the frontend, backend, and manager.

If Pi is not configured yet, follow the [Pi quickstart guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md) and complete provider authentication before starting the workbench.

> [!IMPORTANT]
> Pi Workbench listens only on `127.0.0.1`. Pi can read files, modify code, and execute commands in the selected workspace. Keep important work under version control and review Git actions before confirming them.

## Make it yours

Forking is not a fallback—it is the intended product model.

1. Fork the repository.
2. Start it with `npm run dev`.
3. Select the fork itself as the current workspace.
4. Ask Pi to reshape one part of the interface.
5. Keep only what improves your workflow.

Good places to start:

- add a workflow-specific widget to the right rail;
- change how a tool call or file edit is presented;
- create commands and shortcuts for repeated actions;
- simplify the interface to the features you actually use;
- connect a todo, analysis result, or Git state to your own session flow.

The focused guides in [`docs/README.md`](docs/README.md) and the [`src/features/` map](src/features/README.md) point to the smallest owning area for each kind of change.

## The live architecture

```text
React browser
    │ HTTP + SSE
    ▼
server/backend.ts
    │ local JSON Lines
    ▼
server/manager.ts
    │ Pi public RPC
    ▼
pi --mode rpc
```

The separation is deliberate: the browser can refresh and the backend can restart while the manager continues to own the Pi processes.

| Change | Development behavior | Active session |
| --- | --- | --- |
| React UI and feature styles | Vite hot update | Preserved |
| Backend routes and capabilities | `node --watch` restart | Preserved |
| Manager or Pi process ownership | `node --watch` restart | Current response is interrupted; history can normally resume |

Read [`docs/architecture.md`](docs/architecture.md) before changing boundaries or process ownership.

## Project map

```text
src/features/       Frontend behavior, rendering, and colocated styles
src/api.ts           Browser-to-backend boundary
server/backend.ts    Local HTTP API and SSE stream
server/manager.ts    Sole owner of Pi RPC processes
server/features/     Git, quotas, terminal, and todo capabilities
pi-extensions/       Extensions loaded into Workbench sessions
shared/              Contracts exchanged between layers
test/                Focused automated checks
```

## Checks

Run the narrowest check that covers your change, or the full local set before a larger contribution:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The Pi RPC integration test additionally requires a configured Pi installation.

## Contributing

Personal forks are the point. Focused bug fixes and improvements that preserve the project's small, adaptable core are also welcome upstream.

## License

Pi Workbench is available under the [MIT License](LICENSE).
