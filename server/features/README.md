# Backend capabilities

This directory contains local product capabilities used by `server/backend.ts`. The backend remains the sole HTTP routing and validation boundary; feature modules implement behavior and persistence without defining routes.

- `git/` reads and mutates the selected repository.
- `quotas/` caches provider reports and coordinates refreshes through the manager.
- `terminal/` runs bounded, non-interactive workspace commands.
- `todos/` persists workspace task lists.

These modules do not own Pi processes. All Pi commands continue through `server/manager-client.ts` to `server/manager.ts`.
