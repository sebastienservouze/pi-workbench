# Tool call presentations

Tool calls are displayed by `ToolCallCard` in `src/features/conversation/ToolCallCard.tsx`. The presentation is selected by `toolCallPresentation()` in `src/features/conversation/tool-calls.ts`.

By default, the tool header exposes its full title on hover. Once the call is resolved, its status displays the character counts of its serialized JSON arguments (`↘`) and raw text output (`↗`); these values remain available to hover and screen readers. Its output always shows a four-line preview; a click shows the full output, and the next click hides it. Read and written Markdown and code files are rendered in their appropriate format. Reading an HTML file opens it in the browser with its Windows path converted from WSL.

## Adding a presentation

1. Add an entry to `toolCallPresentations` using the exact RPC tool name as its key.
2. Validate `unknown` arguments inside the presentation function. Never assume their shape.
3. Return a `ToolCallPresentation`:
   - `headerDetail` shows a compact detail in the header; provide the full text in `title` for the tooltip and screen reader;
   - `pendingDetail` only supplements the `In progress…` state.
4. Add a test to `test/tool-calls.test.ts` for the specific presentation and its generic fallback when arguments are invalid.

Add a presentation only when a tool genuinely provides information that is easier to understand in another form.
