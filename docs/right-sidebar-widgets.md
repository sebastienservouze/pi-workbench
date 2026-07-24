# Right sidebar widgets

The right sidebar appears when a Git repository is detected or when actions are pinned to the rail. It is rendered by `RightSidebar` in `src/features/git/RightSidebar.tsx` and connected to cross-cutting state by `src/App.tsx`.

## Composition and behavior

The sidebar has two side-by-side areas:

- a **panel** on the left, displaying the active widget (session analysis, Git, or todos);
- a permanent 48 px **rail** on the right, carrying widget and action icons.

Clicking a panel widget's icon opens its panel without hiding the rail. Clicking the active icon again closes the panel. The rail remains available to reopen that widget or choose another one.

The active widget is stored in `pi-workbench.right-sidebar-widget`; the old `pi-workbench.git-sidebar-collapsed` preference is still read for migration. Each button sets `aria-expanded` and, when its panel is rendered, `aria-controls`.

### Session analysis

The analysis widget is available when a session is selected. Its pure engine, `src/features/session-analysis/session-analysis.ts`, walks messages in `O(n)` time and reconstructs user requests, model calls, and tool calls. It uses `get_session_stats` as the reference for totals and presents the difference from attributable costs as unattributed system cost.

Failures are based exclusively on `isError === true`. Tool volumes are expressed in characters; no monetary cost or token count is invented per tool. Durations observed from SSE events remain in memory for the current Workbench opening and are not persisted.

Clicking an expensive request positions the conversation on its user message. Clicking a tool call activates the detail view if needed, expands the result, and positions the conversation on its card.

### Provider quotas

The Quotas widget displays the 5-hour and 7-day windows returned by OpenAI Codex, followed by the monthly usage returned by GitHub Copilot. It does not infer limits absent from provider responses. Each row specifies the next reset when available. In the rail, the icon is replaced by the primary window for the provider of the selected model: 5 hours for Codex, or the first available usage for Copilot.

Credentials remain in the Pi process: `extensions/quotas.ts` resolves OAuth through the model registry, calls provider endpoints, normalizes responses, and publishes only a non-sensitive snapshot with `setStatus`. The backend keeps the last valid snapshot per provider; if a partial refresh fails, previous data remains visible and is marked stale. Concurrent manual requests are deduplicated.

A snapshot is requested when a Pi session starts and after each turn for the active model provider. Automatic snapshots are spaced at least 30 seconds apart per session; the panel button bypasses this delay and requires an open session. After a backend restart, an existing inactive session can restore the cache without relaunching Pi or adding a message to the conversation.

Provider endpoints are undocumented, so their formats are isolated in `shared/quota-parsers.ts` and covered by `test/quotas.test.ts`. The raw GitHub OAuth credential needed by the quota endpoint is not exposed by the current public `ModelRegistry` API: the extension reads it through Pi runtime's `CredentialStore`, without accessing the credentials file, and keeps this compatibility in the single `readCredential` function.

### Action widgets (no panel)

A widget can be a simple action with no associated panel: it renders an icon in the rail and runs a callback on click. It has no open/closed state and does not interact with the panel.

Actions are passed to `RightSidebar` through the `railActions` prop, an array of `{ key, icon, label, disabled?, onClick }` objects. Each action is rendered as a rail button, with `aria-label` and `title` derived from `label`.

Example usage in `App`:

```tsx
const railActions = useMemo(() => [
  {
    key: 'explorer',
    icon: <svg aria-hidden="true" …>…</svg>,
    label: 'Open folder in Explorer',
    onClick: () => { void openExplorer(workspacePath).catch(…) },
  },
], [workspacePath])
```

The rail remains available for todos and pinned actions even when no Git repository is detected.

### Terminal

The Terminal widget runs an isolated command in the current workspace and keeps its output in the panel while it remains mounted. Each command starts from the workspace cwd: shell state, including `cd` and exported variables, is not preserved. The backend limits a command to 10 minutes and its output to 1 MB.

This lightweight console uses the local `/api/terminal` HTTP API. It intentionally provides no pseudo-terminal, interactive input, or full-screen program support.

### Markdown preview

`.md` and `.markdown` files opened by `read` or `write` tools are rendered directly in the conversation history (inline tool call expansion). `.html` files open in a new local tab. No widget or panel is needed for these formats.

## Layout contract

- The expanded panel can be resized between 240 and 720 px. Its value is local to the browser (`pi-workbench.git-sidebar-width`) and must remain bounded with `clampGitSidebarWidth` in `src/features/git/git-sidebar.ts`.
- The total width of the open column includes the panel and the rail: `panel width + 48 px`.
- The handle is a vertical separator accessible to pointer and keyboard users. Do not make it available when the panel is closed. Left/right arrows, Home, and End preserve their meaning and bounds.
- Below 850 px, the panel is 260 px and the rail is 48 px. Below 700 px, the layout becomes vertical: the panel remains limited to `38dvh` and the rail remains visible to its right.
- The scrollable content has `min-height: 0`, `flex: 1`, and `overflow: auto`. Actions at the bottom of the panel remain outside this scroll area.
- Reuse variables from `src/styles/base.css` (`--surface`, `--line`, `--muted`, `--teal`, etc.) and styles from `src/features/git/git.css`. Do not add a UI library.

The current CSS structure is intentionally minimal: `.git-sidebar` aligns `.git-widget-panel` and `.git-rail`, while `.git-panel` owns the scrollable content. Preserve this separation: the rail must never be a child of the scrollable content.

## Adding a widget

An official widget that strongly depends on central state may still extend existing conditional rendering. A fork should preferably add isolated widgets in the reserved `src/custom/extensions.ts` area, without modifying `App.tsx` or `RightSidebar.tsx`:

```tsx
const StatusWidget = ({ request, workspacePath }: RightSidebarWidgetProps) => {
  // request('/status') always targets /api/extensions/my-workbench/status.
  return <button onClick={() => void request('/status', { method: 'POST', body: JSON.stringify({ cwd: workspacePath }) })}>{workspacePath}</button>
}

export const customExtensions: readonly WorkbenchExtension[] = [{
  id: 'my-workbench',
  rightSidebarWidgets: [{
    id: 'status',
    label: 'Workspace status',
    icon: <span aria-hidden="true">●</span>,
    render: StatusWidget,
  }],
}]
```

The persisted key is derived from the extension and widget identifiers. Two widgets with the same identifier in one extension produce an explicit error. A rendering error is isolated: the panel displays a fallback and the rest of the shell remains usable.

The `request()` prop calls a JSON response in the extension's backend namespace. The relative path cannot leave that namespace. Query string values must still be encoded with `URLSearchParams` or `encodeURIComponent`. For a non-JSON response, the widget can use `fetch` directly on its namespace.

The corresponding Node.js capability is declared separately in `server/custom/extensions.ts`:

```ts
export const customBackendExtensions: readonly WorkbenchBackendExtension[] = [{
  id: 'my-workbench',
  handleRequest: async ({ method, path, readJsonBody, resolveWorkingDirectory }) => {
    if (method !== 'POST' || path !== 'status') throw new BackendExtensionHttpError(404, 'Not found')
    const body = await readJsonBody()
    const cwd = await resolveWorkingDirectory(String(body.cwd ?? ''))
    return { cwd, ok: true }
  },
}]
```

The same `id` connects the two contributions without coupling their modules. The handler must validate all received data. It may return JSON or write directly to the Node.js HTTP response for advanced use cases.

### Panel widget

1. Verify that the information already exists in the Git snapshot, an existing HTTP API, or the SSE stream. Otherwise, add the minimal backend API before the React component.
2. Create a local component only when the widget has its own responsibility. Keep its identifiers, props, and code in English; keep visible copy in English as well. Choose a simple icon consistent with the rail's responsibility, preferably reusing Unicode glyphs already present in the rail. Use a brand mark only when the widget genuinely represents that service; if no icon is obvious, ask for a preference.
3. Add state to `App` (a `useState` for the active widget) and pass it to `RightSidebar` with the required props. The rail renders one icon per widget; the conditional panel renders the active widget.
4. Keep the width and handle on the panel, never on the rail. Preserve local Git preferences while the Git widget uses them.
5. Provide loading, empty, and error states. Actions are native elements, named with `aria-label` when their text is insufficient, and reachable by keyboard. Each rail icon must have a target of at least 44 × 44 px, `aria-expanded`, and a label describing the action.
6. Preserve readability on small screens: truncate content with ellipsis when necessary, avoid a minimum width larger than the panel, and avoid unnecessary nested scrollbars.

### Action widget (no panel)

1. Add an entry to the `railActions` array passed to `RightSidebar`. Each entry is a `RailAction` object:
   ```ts
   interface RailAction {
     key: string       // unique identifier in the rail
     icon: ReactNode   // icon rendered in the button (max ~20×20 px)
     label: string     // label for aria-label and title
     disabled?: boolean // disables the button when true
     onClick: () => void // callback run on click
   }
   ```
2. If the action depends on `workspacePath` or reactive state, build the array with `useMemo` to avoid unnecessary re-renders.
3. The action cannot open a panel. If a panel is needed, create a panel widget.
4. The button inherits the existing `.rail-tab` styles. No additional CSS is required unless the icon needs a minor adjustment (for example, `letter-spacing` for a text glyph).

## Validation

- Add the smallest useful Node test for any non-trivial logic, next to the existing tests in `test/`.
- Run `npm test`, `npm run lint`, and `npm run build`.
- Manually verify opening and closing from the rail, switching between widgets, the persisted width after reload, pointer dragging and keyboard behavior on the handle, and both sidebar breakpoints.
