# Right sidebar

The right sidebar keeps workspace tools close without mixing their behavior. `RightSidebar.tsx` composes the rail, active panel, and accessible resizing; `App.tsx` owns the active widget and width because they affect the whole layout.

## Add a widget

1. Keep rendering and local state in `src/features/<feature>/`, with a short README for any non-obvious contract.
2. Add its identity and human label to `rightWidgetDefinitions` in `right-sidebar.ts`.
3. Render its panel and rail button directly in `RightSidebar.tsx`, including its accessible panel label; use `WidgetLayout` for panel content and `RailAction` only for actions without a panel.
4. Pass existing data and callbacks from `App.tsx`. Add custom command availability there only when the widget is conditional.

The shared definition automatically gives every widget an **Open…** command in the palette and an assignable shortcut in Settings. Rendering remains explicit: do not introduce a component registry.

Width and active widget are stored in `pi-livecraft.right-sidebar-width` and `pi-livecraft.right-sidebar-widget`. Legacy Git sidebar keys are read only as migration fallbacks. Width stays between 240 and 720 px.

Widget contracts: [Git](../git/README.md), [quotas](../quotas/README.md), [terminal](../terminal/README.md), [todo](../todo/README.md), and [session analysis](../session-analysis/README.md). Registry and width behavior are covered by `test/shortcuts.test.ts` and `test/git-sidebar.test.ts`.
