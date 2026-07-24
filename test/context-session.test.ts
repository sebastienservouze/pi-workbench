import assert from 'node:assert/strict'
import test from 'node:test'
import { fileContextDraft, outputContextDraft } from '../src/features/conversation/context-session.ts'

test('prepares references for a new session without sending the draft', () => {
  assert.equal(fileContextDraft('/workspace/src/App.tsx'), 'File to inspect: `/workspace/src/App.tsx`\n\n')
  assert.equal(
    outputContextDraft('# Result\n\n```ts\nconst ready = true\n```'),
    'Previous session output:\n\n> # Result\n> \n> ```ts\n> const ready = true\n> ```\n\n',
  )
})
