<div align="center"><pre>
██████╗ ██╗      ██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗██████╗ ███████╗███╗   ██╗ ██████╗██╗  ██╗
██╔══██╗██║      ██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝██╔══██╗██╔════╝████╗  ██║██╔════╝██║  ██║
██████╔╝██║█████╗██║ █╗ ██║██║   ██║██████╔╝█████╔╝ ██████╔╝█████╗  ██╔██╗ ██║██║     ███████║
██╔═══╝ ██║╚════╝██║███╗██║██║   ██║██╔══██╗██╔═██╗ ██╔══██╗██╔══╝  ██║╚██╗██║██║     ██╔══██║
██║     ██║      ╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗██████╔╝███████╗██║ ╚████║╚██████╗██║  ██║
╚═╝     ╚═╝       ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝
                                                                                              
</pre></div>

<div align="center">

> Pi Workbench is a local web interface for using multiple [Pi](https://github.com/earendil-works/pi) sessions in the same workspace. It keeps Pi sessions independent from the interface: restarting the frontend or backend does not interrupt an active session.

</div>

The application listens only on `127.0.0.1`: it is not exposed to the network.

## A project to adapt

Pi Workbench is not intended to be a black box or a fixed architecture. It is a local tool that you can modify to fit your workflow, environment, or Pi extensions.

Forks are welcome: start from this repository, simplify it, add your ideas, or turn it into something very different. Keep an eye on existing contracts and compatibility changes. The manager is the link to Pi processes in particular; changing it can interrupt a connection and an active response. In that case, the session can usually be resumed through Pi history.

The goal is to remain simple enough to understand, fix, and transform. If your adaptation serves a different need better, it deserves to exist as a fork rather than waiting to be merged into the main project.

## What the interface provides

- create a Pi session or reopen an existing session for the selected directory;
- chat with Pi and follow its live responses and tool calls;
- use the models, thinking levels, and commands available in Pi;
- answer supported extension dialogs;
- inspect Git status, diffs, and files read or written by Pi;
- commit and push changes from the Git panel.

> Pi can read, modify, and execute commands in the selected directory. Use a Git repository or another backup mechanism before trusting it with important changes.

## How it works

The browser communicates with a local HTTP backend. This backend forwards requests to a separate manager, which is solely responsible for `pi --mode rpc` processes. This separation lets you update the interface without losing active Pi sessions.

Pi stores the sessions. After the manager restarts, Pi Workbench relaunches them with their history; a response that was in progress when the manager restarted is nevertheless interrupted.

## Requirements

- [Node.js](https://nodejs.org/) 24 or newer;
- npm;
- Pi installed, configured, and available in `PATH`;
- an account connected to a model provider or an API key configured for Pi.

Check the installation:

```bash
node --version
npm --version
pi --version
```

### Install and configure Pi

If Pi is not installed yet:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

Then start `pi` in a terminal and use `/login` to sign in to a provider. See the [Pi quickstart guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md) for other authentication and configuration modes.

## Install Pi Workbench

Clone the repository, then install its dependencies:

```bash
git clone <repository-url>
cd pi-workbench
npm install
```

## Start the application

For development, one command starts the Pi manager, backend, and frontend:

```bash
npm run dev
```

Then open [http://127.0.0.1:5173](http://127.0.0.1:5173). Press `Ctrl+C` in the terminal to stop all three services.

### Build and run the production version

One command builds the interface, then starts the manager and backend. `Ctrl+C` stops both services:

```bash
npm start
```

The interface is available at [http://127.0.0.1:43121](http://127.0.0.1:43121).

## First use

1. Open the application in your browser.
2. Click **Current directory** and choose the directory where Pi should work.
3. Click **New session**.
4. Enter your request in the composer, for example: “Analyze this repository and explain how to run its checks.”
5. Follow the responses and tool calls in the conversation.

Recent sessions for the selected directory appear in the left sidebar. Click one to resume it. The agent selector appears only if your Pi installation exposes the corresponding command.

## Git and file previews

When a Git repository is detected in the current directory, the right panel displays the branch, changed files, diffs, and unpushed commits. You can enter a message there to **commit and push** changes.

This action really executes Git operations in the selected directory. Review the diff and remote destination before confirming.

After a Pi `read` or `write` call, the conversation can expand the relevant content. Markdown is rendered directly in the history, and an HTML document from the workspace can be opened in a new local tab.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `pi` cannot be found | Install Pi, then check that its installation directory is in `PATH` with `pi --version`. |
| Pi does not respond or no model is available | Start `pi` in a terminal and finish setup with `/login`, or configure your API key. |
| The page does not open | Check that `npm run dev` is still running and open the exact address displayed by Vite. |
| The port is already in use | Stop the process using it or choose another port with `PI_WORKBENCH_MANAGER_PORT` and `PI_WORKBENCH_BACKEND_PORT` before starting. |
| A session does not reopen | Check that its working directory still exists and that you selected the same directory in the interface. |

## Project checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The integration test requires a configured `pi` command. To run it alone:

```bash
npm test -- test/pi-rpc.integration.test.ts
```

## Project structure

- `src/App.tsx` — cross-cutting interface state orchestration;
- `src/features/` — components, logic, and styles grouped by feature;
- `src/styles/` — global and responsive styles;
- `server/manager.ts` — owner of Pi processes;
- `server/backend.ts` — local API and event broadcasting;
- `shared/` — contracts exchanged between layers;
- `test/` — automated tests.

See [`docs/architecture.md`](docs/architecture.md) for boundaries, flows, and recommended locations for changes.
