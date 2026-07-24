<div align="center"><pre>
██████╗ ██╗      ██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗██████╗ ███████╗███╗   ██╗ ██████╗██╗  ██╗
██╔══██╗██║      ██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝██╔══██╗██╔════╝████╗  ██║██╔════╝██║  ██║
██████╔╝██║█████╗██║ █╗ ██║██║   ██║██████╔╝█████╔╝ ██████╔╝█████╗  ██╔██╗ ██║██║     ███████║
██╔═══╝ ██║╚════╝██║███╗██║██║   ██║██╔══██╗██╔═██╗ ██╔══██╗██╔══╝  ██║╚██╗██║██║     ██╔══██║
██║     ██║      ╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗██████╔╝███████╗██║ ╚████║╚██████╗██║  ██║
╚═╝     ╚═╝       ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝
</pre></div>

<div align="center">

**A local web interface for running and adapting multiple [Pi](https://github.com/earendil-works/pi) sessions.**

The manager keeps active sessions independent from frontend and backend restarts.

</div>

Pi Workbench listens only on `127.0.0.1`; it is not exposed to the network.

## Quick start

You need Node.js 24 or newer, npm, and a configured `pi` command:

```bash
node --version
npm --version
pi --version
```

If Pi is not installed, install it and complete provider setup with `/login`:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi
```

See the [Pi quickstart guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md) for API-key and alternative authentication modes.

Clone Pi Workbench, install its dependencies, and start all three development processes:

```bash
git clone <repository-url>
cd pi-workbench
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). `Ctrl+C` stops the manager, backend, and frontend.

## First session

1. Click **Current directory** and choose the directory where Pi should work.
2. Click **New session**.
3. Enter a request, such as “Analyze this repository and explain how to run its checks.”
4. Follow responses and tool calls in the conversation.

Recent sessions for the selected directory appear in the left sidebar. The agent selector appears only when Pi exposes the corresponding command.

> Pi can read, modify, and execute commands in the selected directory. Use Git or another backup mechanism before trusting it with important work.

## What the interface provides

- create or reopen several Pi sessions in one workspace;
- follow responses, thinking activity, usage, and tool calls live;
- use the models, thinking levels, agents, and commands exposed by Pi;
- answer supported extension dialogs;
- inspect Git status, diffs, files touched by Pi, and unpushed commits;
- commit, push, or revert eligible local changes;
- run workspace commands, track todos, and inspect session activity.

## Designed to be adapted

Pi Workbench is intentionally small enough to understand and reshape. Ask the running agent to modify the application and the frontend can update while Pi keeps the active session alive.

Forks are welcome: simplify the interface, add workflow-specific widgets, or take the project in a different direction. Preserve observable contracts when possible. Changing or restarting the manager interrupts the current response, although Pi history can normally resume the session.

Implementation guides are deliberately progressive: start from the [`docs/README.md`](docs/README.md) task index and read only the feature guide relevant to the change.

## How it works

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

The manager is the sole owner of Pi processes. Restarting the frontend or backend does not close an active session; restarting the manager does interrupt an in-progress response.

## Production build

Build the interface and start the manager plus backend:

```bash
npm start
```

Open [http://127.0.0.1:43121](http://127.0.0.1:43121). `Ctrl+C` stops both processes.

## Git and file previews

When the selected directory is a Git repository, the right panel displays its branch, changed files, diffs, and unpushed commits. Commit and push actions execute real Git operations in that directory; review the diff and remote destination first.

Read and write tool calls can expand workspace content in the conversation. Markdown and code are rendered in place, while HTML documents can open in a separate local tab.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `pi` cannot be found | Install Pi and confirm its installation directory is in `PATH` with `pi --version`. |
| Pi does not respond or has no model | Start `pi` in a terminal and finish `/login`, or configure an API key. |
| The page does not open | Confirm `npm run dev` is running and use the exact address printed by Vite. |
| A port is already in use | Stop its process or set `PI_WORKBENCH_MANAGER_PORT` and `PI_WORKBENCH_BACKEND_PORT` before starting. |
| A session does not reopen | Confirm its working directory still exists and select that same directory. |

## Project checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The integration test requires a configured Pi installation:

```bash
npm test -- test/pi-rpc.integration.test.ts
```

## Project structure

- `src/App.tsx` — cross-cutting interface orchestration;
- `src/features/` — frontend behavior, rendering, and colocated styles by area;
- `src/api.ts` — browser-to-backend boundary;
- `server/backend.ts` — HTTP validation, routing, and SSE broadcasting;
- `server/manager.ts` — owner of Pi processes;
- `server/features/` — local backend capabilities by domain;
- `pi-extensions/` — extensions loaded into every Workbench session;
- `shared/` — contracts exchanged between layers;
- `test/` — focused automated tests.
