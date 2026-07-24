# Session analysis

This frontend-only feature derives request, model, and tool activity from the current session snapshot plus durations observed during the current Workbench run. It can navigate back to a conversation message or tool call.

The analysis is computed in linear time. Pi session totals are authoritative; unmatched cost is reported as unattributed instead of assigned heuristically. Failures require `isError === true`. Main coverage: `test/session-analysis.test.ts`.
