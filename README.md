<div align="center">

# Pi Livecraft

**Craft your own Pi client while it runs.**

[![Version](https://img.shields.io/github/package-json/v/sebastienservouze/pi-livecraft?style=flat-square&label=version)](package.json)
[![License](https://img.shields.io/github/license/sebastienservouze/pi-livecraft?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/sebastienservouze/pi-livecraft?style=flat-square&logo=github)](https://github.com/sebastienservouze/pi-livecraft/stargazers)
[![Use this template](https://img.shields.io/badge/Use_this_template-2ea44f?style=flat-square&logo=github)](https://github.com/new?template_name=pi-livecraft&template_owner=sebastienservouze)

[Why Pi Livecraft?](#why-pi-livecraft) · [Quick start](#quick-start) · [Make it yours](#make-it-yours)

</div>

<!-- HERO MEDIA — keep one strong visual, not both. -->
<p align="center"><img src="./docs/assets/showcase%20pi-livecraft.png" alt="Pi Livecraft interface" width="1200" /></p>

<!-- Demo GIF:
<p align="center"><img src="./docs/assets/pi-livecraft-demo.gif" alt="Editing Pi Livecraft from a live Pi session" width="1200" /></p>
-->

## Why Pi Livecraft?

Pi is already powerful in a terminal. But a conversation does not have to remain a stream of text: its messages, tool calls, state, and live events can become the building blocks of a real interactive program.

- **Turn conversations into workflows.** Attach actions to messages and tool calls, carry context from one step to the next, automate recurring sequences, and surface the right controls at the right moment.
- **Give Pi an interface built for the task.** Use buttons, forms, previews, dashboards, and visualizations instead of translating every intent back into another prompt or shell command.
- **Build on Pi instead of rebuilding it.** Keep Pi's sessions, models, tools, history, and extension system, then combine them with a React frontend and local backend to shape a focused application.
- **Let the program evolve while you use it.** Ask Pi to modify the interface or workflow from an active session; frontend changes appear immediately and backend changes restart without closing the Pi process.

Pi Livecraft starts as a capable client, not a finished product you must accept as-is. Create your own repository from the template. Delete half of it. Add the oddly specific workflow only you need. The source code is the customization surface.

## Quick start

Pi Livecraft is designed to run in development mode. You need **Node.js 24 or newer**, **npm**, and **Pi**.

### 1. Install Pi

Pi is required: Pi Livecraft provides the interface, but it does not bundle the agent. Install the [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) package, then launch Pi once to configure a provider:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi
```

Use `/login` inside Pi, or follow the [Pi quickstart guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md) for API keys and alternative authentication modes. If `pi --version` already works and a provider is configured, you are ready.

### 2. Create your repository

Click **[Use this template](https://github.com/new?template_name=pi-livecraft&template_owner=sebastienservouze)**, choose a name and visibility, then clone the repository GitHub creates for you. Unlike a fork, your repository starts with its own history and is yours to reshape.

### 3. Install and run

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
cd YOUR-REPOSITORY
npm install
npm run dev
```

`npm run dev` keeps the frontend, backend, and manager watched while you reshape them. Open [http://127.0.0.1:5173](http://127.0.0.1:5173); `Ctrl+C` stops all three processes.

> [!WARNING]
> **Pi is not sandboxed.** It runs with your user permissions and can read files, modify code, and execute commands. Keep important work under version control and review Git actions before confirming them. Pi Livecraft limits network exposure by listening only on `127.0.0.1`.

## What is already included

- **Session workspace** — create, switch, and reopen parallel Pi sessions without tying them to the browser lifecycle.
- **Live execution** — inspect responses, activity, usage, rich tool calls, file previews, and extension dialogs as they happen.
- **Session analysis** — track context, tokens, costs per turn, tool activity, and failures, then jump back to the relevant message or call.
- **Provider quotas** — monitor OpenAI Codex windows and GitHub Copilot usage from the right rail.
- **Git workspace** — review status, diffs, touched files, and unpushed commits; commit, push, or revert without changing context.
- **Focused side tools** — keep todos and bounded workspace commands one click away.
- **Pi-native controls** — use the models, thinking levels, and commands exposed by Pi.
- **Personal controls** — command palette, editable shortcuts, persistent drafts, resizable panels, and light or dark themes.

## Make it yours

The template is a starting point, not an upstream your application must follow. **Creating an independent repository is the intended product model.** There is no canonical setup to converge on and no prize for keeping every feature.

1. Create a repository with **Use this template**.
2. Clone it and start it with `npm run dev`.
3. Select that repository as the current workspace.
4. Ask Pi to reshape one part of the interface.
5. Keep the useful bits. Gleefully remove the rest.

Good places to start:

- add a workflow-specific widget to the right rail;
- change how a tool call or file edit is presented;
- create commands and shortcuts for repeated actions;
- turn a recurring workspace command into a first-class action;
- simplify the interface to the features you actually use.

The focused guides in the [documentation index](docs/README.md) and [frontend feature map](src/features/README.md) point to the smallest owning area for each kind of change.

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
src/features/        Frontend behavior, rendering, and colocated styles
src/api.ts           Browser-to-backend boundary
server/backend.ts    Local HTTP API and SSE stream
server/manager.ts    Sole owner of Pi RPC processes
server/features/     Git, quotas, terminal, and todo capabilities
pi-extensions/       Extensions loaded ONLY into Livecraft sessions
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

Applications built from the template belong in their own repositories and do not need to stay synchronized with Pi Livecraft. Focused bug fixes and improvements to the reusable starting point are welcome here.

## License

Pi Livecraft is available under the [MIT License](LICENSE).
