# Backend capabilities

This directory contains local product capabilities used by `server/backend.ts`. The backend remains the sole HTTP routing and validation boundary; feature modules implement behavior and persistence without defining routes.

- [`git/`](git/README.md) reads and mutates the selected repository.
- [`quotas/`](quotas/README.md) caches provider reports and coordinates refreshes through the manager.
- [`terminal/`](terminal/README.md) runs bounded, non-interactive workspace commands.
- [`todos/`](todos/README.md) persists workspace task lists.

These modules do not own Pi processes. All Pi commands continue through `server/manager-client.ts` to `server/manager.ts`.
