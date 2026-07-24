# Right sidebar

The right sidebar composes the persistent rail, active integrated widget, collapse state, and accessible resizing. `App.tsx` owns the active widget and width because they affect the application layout.

Add a panel widget directly in `RightSidebar.tsx`, keep its rendering and state in `src/features/<feature>/`, and pass only existing data and callbacks. Do not add a widget registry. Panel content uses `WidgetLayout`; action-only entries use `RailAction`.

Width is stored in `pi-workbench.right-sidebar-width` and bounded from 240 to 720 px. The legacy `pi-workbench.git-sidebar-width` key is read only as a fallback. The active widget uses `pi-workbench.right-sidebar-widget`; `pi-workbench.git-sidebar-collapsed` remains a historical migration fallback.

Widget contracts live in the README for [Git](../git/README.md), [quotas](../quotas/README.md), [terminal](../terminal/README.md), [todo](../todo/README.md), and [session analysis](../session-analysis/README.md). Width and diff parsing are covered by `test/git-sidebar.test.ts`.
