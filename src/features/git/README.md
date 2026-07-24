# Git frontend

This feature displays repository status, changed files, diffs, unpushed commits, commit/push actions, and revert actions. `App.tsx` fetches data through `src/api.ts`; `GitWidget` owns only local selection, message, busy, and diff state.

Git HTTP routes are implemented by the backend Git capability. The public response shapes remain in `shared/types.ts`.

Unified diff parsing stays pure in `git-diff.ts`. Deleted and renamed files are not selectable because no textual diff is requested for them. Main coverage: `test/git-sidebar.test.ts` and `test/git.test.ts`.
