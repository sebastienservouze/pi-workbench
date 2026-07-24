# Commands

The command registry is the shared source for the palette, global keyboard handling, and editable shortcuts. `App.tsx` supplies execution and availability because commands act on cross-cutting state.

## Add a command

1. Add its identifier to `CommandId` and its label to `commandDefinitions` in `command-registry.ts`.
2. Add a default shortcut only when the command deserves one; every other command remains assignable from Settings.
3. Handle execution and disabled state in `App.tsx`.
4. Cover reusable normalization or registry behavior in `test/shortcuts.test.ts`.

Sidebar widgets are the exception to step 1: adding their identity to `rightWidgetDefinitions` automatically creates an `open-widget-*` command. It appears in the palette and Settings without a separate registration. Add custom availability in `App.tsx` only when the widget itself is conditional.

Read the [right sidebar guide](../right-sidebar/README.md) only when adding or rendering a widget.
