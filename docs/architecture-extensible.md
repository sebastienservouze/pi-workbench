# Customizing Pi Workbench in a fork

Pi Workbench follows a **source-first** model: customizations are written in a fork, compiled with the application, and reloaded by Vite during development. The source code remains fully editable; extension points only exist to avoid recurring upstream conflicts.

They are not a plugin platform or an API maintained separately from the project. An upstream change may require adapting fork code; TypeScript and tests make such a break visible at build time.

## The chosen trade-off

```text
Upstream repository
├── core and official features
└── reserved customization seams

User fork
├── isolated frontend and backend contributions
└── direct changes when the seams are not enough
```

The simplest path wins: directly changing a local component is normal. A dedicated contribution is useful only when it avoids changing a central point or makes upstream changes easier to reapply.

## Why plugins are not loaded at runtime

The fork and `npm run dev` already provide TypeScript, React, HMR, and import resolution. Pi Workbench therefore does not add:

- a marketplace or plugin manager;
- remote JavaScript loading;
- Module Federation;
- a sandbox or permission system;
- a dynamic activation or versioning protocol.

Custom code is treated like the rest of the fork. It must be reviewed before compilation and is not isolated from the local system.

## Frontend contributions

Frontend contributions live in `src/custom/extensions.ts`. They can currently provide:

- tool call renderers;
- renderers for visible custom Pi messages;
- an activity renderer;
- right sidebar widgets.

```ts
interface WorkbenchExtension {
  id: string
  toolCalls?: Record<string, ToolCallRenderer>
  messages?: Record<string, CustomMessageRenderer>
  activity?: ActivityRenderer
  rightSidebarWidgets?: readonly RightSidebarWidget[]
}
```

The registry rejects ambiguous identifiers and competing contributions. A renderer error is isolated and uses the official rendering as a fallback when one exists.

Pi messages whose role is `custom` and whose `display` is `true` can be rendered by `messages[customType]`. Hidden messages remain excluded from the snapshot sent to the browser so internal Pi context is not exposed implicitly.

These types are practical seams compiled with the fork, not a compatibility guarantee between versions. A need that does not fit these contributions can modify the relevant component directly.

## Backend contributions

A widget that needs local system access can declare a Node.js capability in `server/custom/extensions.ts`:

```text
React widget
    │ /api/extensions/<extension-id>/*
    ▼
Namespaced backend route
    │
    ▼
Node.js API and local system
```

Each contribution exclusively owns its `/api/extensions/<extension-id>/*` namespace and cannot replace a core route. Its `handleRequest` receives the method, relative path, URL, Node.js HTTP objects, and the `readJsonBody()` and `resolveWorkingDirectory()` helpers.

The returned value is serialized as JSON with status 200. The handler can also write directly to `response` to produce another status, a file, or a stream, and can throw `BackendExtensionHttpError` for a controlled HTTP error.

All HTTP data is untrusted. The handler must validate its body, parameters, and workspace. The backend continues to listen only on `127.0.0.1`.

## Pi hooks

Behavior executed in `before_agent_start`, `tool_call`, `context`, or other hooks belongs to a Pi extension, not React. A fork that needs it uses Pi's public extension mechanism and explicitly adapts its launch in the manager.

`server/manager.ts` remains the sole owner of `pi --mode rpc` processes. No Workbench extension point should move that responsibility or make the agent loop depend on a browser tab.

## Areas reserved for forks

The empty manifests are:

```text
src/custom/extensions.ts
server/custom/extensions.ts
```

Fork-specific code can be colocated under these directories. Custom styles should prefer existing variables, CSS Modules, or prefixed classes to limit collisions.

Internal imports, selectors targeting implementation details, and direct changes are allowed. They may simply require manual resolution during an upstream update.

## Intentional limit

Add a new extension point only for a concrete need that crosses a central file or causes repeated conflicts. Pi Workbench does not aim to make every component replaceable, extract a headless runtime, or provide a generic alternative shell.

The goal is to keep a few useful seams for forks, not to build a plugin factory.
