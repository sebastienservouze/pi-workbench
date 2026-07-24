# Pi extensions

These extensions are loaded into every Pi process started by Workbench:

- `ask-user-question.ts` registers the structured questionnaire tool and bridges its versioned payload through Pi's extension UI protocol.
- `quotas.ts` registers the private `/workbench-quotas` command and publishes normalized provider usage through a versioned status payload.

`server/pi-process.ts` owns the extension paths. These modules use Pi's public extension API and shared protocols only; they do not define Workbench HTTP routes.
