# Frontend features

Start with the area that owns the behavior. Read `App.tsx` only when state coordinates several areas; browser-to-backend calls always go through `src/api.ts`.

## Conversation loop

- `workspace/` selects directories and creates, reopens, or switches sessions.
- `composer/` prepares prompts, images, slash commands, and per-session drafts.
- `conversation/` renders messages, activity, usage, tool calls, and file previews. Tool presentation changes have a [focused guide](conversation/README.md).
- `dialogs/` handles versioned UI requests sent by Pi extensions.

## Application controls

- `commands/` owns the command registry, palette, and keyboard normalization. See [commands](commands/README.md).
- `settings/` edits local preferences exposed to the user. See [settings and preferences](settings/README.md).
- `notifications/` displays transient notices and persistent errors.
- `right-sidebar/` composes workspace widgets and rail actions. See [right sidebar](right-sidebar/README.md).

## Workspace widgets

- `git/`, `quotas/`, `session-analysis/`, `terminal/`, and `todo/` each keep their rendering and local state within their directory.
- Their README files name the data owner, invariants, backend counterpart when one exists, and focused tests.

Read the [project architecture](../../docs/architecture.md) only when a change crosses the frontend, HTTP API, manager, or Pi process boundaries.
