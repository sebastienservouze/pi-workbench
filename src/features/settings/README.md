# Settings and preferences

`SettingsPanel` exposes user-editable local preferences. `App.tsx` owns values that coordinate the application; feature-only persistence stays beside the feature that uses it.

## Current ownership

- `commands/` defines commands, default shortcuts, normalization, and conflict detection.
- `settings/` captures shortcut changes and resets them.
- `App.tsx` persists shortcuts, theme, conversation view, workspace restoration, and right sidebar state.
- `composer/` persists drafts per session.

All values stay in browser `localStorage`; never store secrets there. Readers must tolerate missing, malformed, and documented legacy values so a preference cannot prevent startup. The palette and Settings shortcuts remain fixed to keep both surfaces recoverable.

## Add a preference

Keep the value with its narrowest owner, expose it in `SettingsPanel` only when users should configure it, and persist it under the `pi-livecraft.` prefix. Add a focused test when parsing, migration, or validation is non-trivial.

Read [commands](../commands/README.md) for palette entries and shortcuts, or [right sidebar](../right-sidebar/README.md) for widget state.
