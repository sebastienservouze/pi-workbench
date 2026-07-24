# Quotas frontend

This feature displays normalized Codex and Copilot quota windows and the active provider summary in the right rail. Data flows from `App.tsx`, through `src/api.ts`, to the quotas backend route and Pi quota protocol.

The UI never infers missing limits. Previous provider data remains visible when marked stale, and refresh state comes from the backend snapshot. Main coverage: `test/quotas.test.ts`.
