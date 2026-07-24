import assert from 'node:assert/strict'
import test from 'node:test'
import { applyToolCallUpdate, formatToolCallTooltip, formatToolData, interruptToolCallGeneration, isToolCallPending, readContentDisplay, toolCallInUpdate, toolCallPresentation, toolCallsInMessage, toolContentText, toolDataLength, toolEditChanges, toolFilePath, toolResultInMessage, toolTextPreview, truncateToolText, windowsFileUrl } from '../src/features/conversation/tool-calls.ts'

test('extracts tool calls and their resolved result from Pi messages', () => {
  const calls = toolCallsInMessage({
    role: 'assistant',
    content: [
      { type: 'text', text: 'Je regarde.' },
      { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'src/App.tsx' } },
    ],
  })
  const result = toolResultInMessage({
    role: 'toolResult',
    toolCallId: 'call_1',
    toolName: 'read',
    content: [{ type: 'text', text: 'import App' }],
    isError: false,
  })

  assert.deepEqual(calls, [{ id: 'call_1', name: 'read', args: { path: 'src/App.tsx' } }])
  assert.deepEqual(result, {
    toolCallId: 'call_1',
    toolName: 'read',
    content: [{ type: 'text', text: 'import App' }],
    isError: false,
  })
  assert.equal(toolContentText(result?.content), 'import App')
})

test('tracks raw tool arguments from generation start to completion', () => {
  const partialCall = { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'src/App' } }
  const start = toolCallInUpdate({
    type: 'message_update',
    assistantMessageEvent: { type: 'toolcall_start', contentIndex: 1, partial: { content: [{ type: 'text' }, partialCall] } },
  })
  const delta = toolCallInUpdate({
    type: 'message_update',
    assistantMessageEvent: { type: 'toolcall_delta', contentIndex: 1, delta: '{"path":"src/App', partial: { content: [{ type: 'text' }, partialCall] } },
  })
  const end = toolCallInUpdate({
    type: 'message_update',
    assistantMessageEvent: {
      type: 'toolcall_end',
      contentIndex: 1,
      toolCall: { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'src/App.tsx' } },
    },
  })

  assert.deepEqual(start, { call: { id: 'call_1', name: 'read', args: { path: 'src/App' } }, contentIndex: 1, delta: '', phase: 'start' })
  assert.deepEqual(delta, { call: { id: 'call_1', name: 'read', args: { path: 'src/App' } }, contentIndex: 1, delta: '{"path":"src/App', phase: 'delta' })
  assert.deepEqual(end, { call: { id: 'call_1', name: 'read', args: { path: 'src/App.tsx' } }, contentIndex: 1, delta: '', phase: 'end' })
  assert.equal(toolCallInUpdate({ type: 'message_update', assistantMessageEvent: { type: 'text_delta' } }), null)
})

test('accumulates raw arguments and preserves interrupted generations', () => {
  const start = { call: { id: '', name: 'write', args: {} }, contentIndex: 0, delta: '', phase: 'start' as const }
  const delta = { call: { id: 'call_1', name: 'write', args: { path: 'note' } }, contentIndex: 0, delta: '{"path":"note', phase: 'delta' as const }
  const executions = applyToolCallUpdate(applyToolCallUpdate([], start, 'draft_1'), delta, 'unused')

  assert.deepEqual(executions, [{
    id: 'call_1',
    name: 'write',
    args: { path: 'note' },
    contentIndex: 0,
    rawArgs: '{"path":"note',
    rawArgsLength: delta.delta.length,
    status: 'generating',
  }])
  assert.equal(interruptToolCallGeneration(executions)[0]?.status, 'interrupted')

  const completed = applyToolCallUpdate(executions, {
    call: { id: 'call_1', name: 'write', args: { path: 'note.md' } },
    contentIndex: 0,
    delta: '',
    phase: 'end',
  }, 'unused')
  assert.equal(completed[0]?.status, 'running')
  assert.equal(completed[0]?.rawArgs, undefined)
  assert.deepEqual(completed[0]?.args, { path: 'note.md' })
})

test('freezes long streamed write and edit arguments while counting characters', () => {
  const start = { call: { id: 'call_1', name: 'write', args: { path: 'note.md' } }, contentIndex: 0, delta: '', phase: 'start' as const }
  const firstDelta = 'a'.repeat(401)
  const executions = applyToolCallUpdate(applyToolCallUpdate([], start, 'unused'), {
    call: { id: 'call_1', name: 'write', args: { path: 'note.md', content: firstDelta } },
    contentIndex: 0,
    delta: firstDelta,
    phase: 'delta',
  }, 'unused')
  const continued = applyToolCallUpdate(executions, {
    call: { id: 'call_1', name: 'write', args: { path: 'note.md', content: `${firstDelta}\nsix` } },
    contentIndex: 0,
    delta: '\nsix',
    phase: 'delta',
  }, 'unused')

  assert.equal(continued[0]?.rawArgs, `${'a'.repeat(400)}…`)
  assert.equal(continued[0]?.rawArgsLength, firstDelta.length + 4)
  assert.equal(continued[0]?.rawArgsTruncated, true)
  assert.deepEqual(continued[0]?.args, { path: 'note.md', content: firstDelta })

  const edit = applyToolCallUpdate(applyToolCallUpdate([], { ...start, call: { id: 'call_2', name: 'edit', args: {} } }, 'unused'), {
    call: { id: 'call_2', name: 'edit', args: { edits: [] } },
    contentIndex: 0,
    delta: firstDelta,
    phase: 'delta',
  }, 'unused')
  assert.equal(edit[0]?.rawArgs, `${'a'.repeat(400)}…`)
  assert.equal(edit[0]?.rawArgsTruncated, true)
})

test('marks a tool call as pending until its result arrives', () => {
  assert.equal(isToolCallPending(undefined), true)
  assert.equal(isToolCallPending({ toolCallId: 'call_1', toolName: 'read', content: '', isError: false }), false)
})

test('ignores non-tool content and formats tool arguments safely', () => {
  assert.deepEqual(toolCallsInMessage({ role: 'assistant', content: [{ type: 'text', text: 'Bonjour' }] }), [])
  assert.equal(toolResultInMessage({ role: 'user', content: 'Bonjour' }), null)
  assert.equal(formatToolData({ command: 'pwd' }), '{\n  "command": "pwd"\n}')
})

test('extracts valid edit replacements without accepting malformed entries', () => {
  assert.deepEqual(toolEditChanges({
    edits: [
      { oldText: 'before', newText: 'after' },
      { oldText: '', newText: 'inserted' },
      { oldText: 'missing replacement' },
    ],
  }), [
    { oldText: 'before', newText: 'after' },
    { oldText: '', newText: 'inserted' },
  ])
  assert.deepEqual(toolEditChanges({ edits: 'not an array' }), [])
})

test('measures serialized arguments and adds input and output sizes below the full tool title', () => {
  assert.equal(toolDataLength({ command: 'pwd' }), 17)
  assert.equal(formatToolCallTooltip('pwd', 17), 'pwd\nCall: 17 characters')
  assert.equal(formatToolCallTooltip('pwd', 17, 0), 'pwd\nCall: 17 characters · Result: 0 characters')
})

test('truncates text only after 140 characters', () => {
  const limit = 'a'.repeat(140)
  assert.deepEqual(truncateToolText(limit), { text: limit, truncated: false })
  assert.deepEqual(truncateToolText(`${limit}b`), { text: `${limit}…`, truncated: true })
})

test('previews four lines and reports the remaining output', () => {
  assert.deepEqual(toolTextPreview('one\ntwo\nthree\nfour\nfive\nsix'), {
    text: 'one\ntwo\nthree\nfour…',
    remainingLineCount: 2,
  })
  assert.deepEqual(toolTextPreview('one\ntwo\nthree\nfour\n'), {
    text: 'one\ntwo\nthree\nfour\n',
    remainingLineCount: 0,
  })
})

test('builds browser file URLs from Windows and WSL share paths', () => {
  assert.equal(windowsFileUrl('C:\\Users\\Ada Lovelace\\index.html'), 'file:///C:/Users/Ada%20Lovelace/index.html')
  assert.equal(windowsFileUrl('\\\\wsl.localhost\\Ubuntu\\home\\ada\\index.html'), 'file://wsl.localhost/Ubuntu/home/ada/index.html')
})

test('detects Markdown, HTML, SVG and supported code formats read from the repository', () => {
  assert.deepEqual(readContentDisplay({ path: 'docs/guide.md' }), { kind: 'markdown' })
  assert.deepEqual(readContentDisplay({ path: 'src/App.tsx' }), { kind: 'code', language: 'typescript' })
  assert.deepEqual(readContentDisplay({ path: 'public/preview.html' }), { kind: 'html' })
  assert.deepEqual(readContentDisplay({ path: 'public/logo.SVG' }), { kind: 'svg' })
  assert.deepEqual(readContentDisplay({ path: 'src/Program.cs' }), { kind: 'code', language: 'csharp' })
  assert.deepEqual(readContentDisplay({ path: 'notes.txt' }), { kind: 'text' })
  assert.deepEqual(readContentDisplay({}), { kind: 'text' })
})

test('extracts a usable file path from read and write calls', () => {
  assert.equal(toolFilePath({ path: 'src/App.tsx' }), 'src/App.tsx')
  assert.equal(toolFilePath({ path: '' }), null)
  assert.equal(toolFilePath({}), null)
})

test('uses the Bash presentation while preserving the generic fallback', () => {
  const command = 'a'.repeat(81)
  assert.deepEqual(toolCallPresentation({ id: 'call_1', name: 'bash', args: { command, timeout: 30 } }), {
    headerDetail: { text: `${'a'.repeat(80)}…`, title: command },
    pendingDetail: 'timeout: 30s',
  })
  assert.deepEqual(toolCallPresentation({ id: 'call_2', name: 'bash', args: { timeout: 30 } }), {})
})

test('displays search patterns and their optional paths', () => {
  const root = '/workspace/repository'

  assert.deepEqual(toolCallPresentation({ id: 'call_1', name: 'find', args: { pattern: 'tool call', path: `${root}/src` } }, root), {
    headerDetail: { text: 'tool call · src', title: 'tool call · src' },
  })
  assert.deepEqual(toolCallPresentation({ id: 'call_2', name: 'grep', args: { pattern: 'toolCallPresentation' } }, root), {
    headerDetail: { text: 'toolCallPresentation', title: 'toolCallPresentation' },
  })
  assert.deepEqual(toolCallPresentation({ id: 'call_3', name: 'find', args: { path: 'src' } }, root), {})
})

test('displays file tool paths relative to the repository and truncates them', () => {
  const root = '/workspace/repository'
  const path = `${root}/src/${'a'.repeat(80)}`

  for (const name of ['read', 'edit', 'write']) {
    assert.deepEqual(toolCallPresentation({ id: 'call_1', name, args: { path } }, root), {
      headerDetail: { text: `src/${'a'.repeat(76)}…`, title: `src/${'a'.repeat(80)}` },
    })
  }
  assert.deepEqual(toolCallPresentation({ id: 'call_2', name: 'read', args: { path: '/tmp/file.txt' } }, root), {
    headerDetail: { text: '/tmp/file.txt', title: '/tmp/file.txt' },
  })
  assert.deepEqual(toolCallPresentation({ id: 'call_3', name: 'read', args: {} }, root), {})
})

test('keeps the read range visible beside a truncated path', () => {
  const root = '/workspace/repository'
  const path = `${root}/src/${'a'.repeat(80)}`

  assert.deepEqual(toolCallPresentation({ id: 'call_1', name: 'read', args: { path, offset: 41, limit: 20 } }, root), {
    headerDetail: { text: `src/${'a'.repeat(76)}…`, title: `src/${'a'.repeat(80)}`, suffix: '[41:60]' },
  })
  assert.deepEqual(toolCallPresentation({ id: 'call_2', name: 'read', args: { path: 'src/App.tsx', limit: 60 } }, root), {
    headerDetail: { text: 'src/App.tsx', title: 'src/App.tsx', suffix: '[1:60]' },
  })
  assert.deepEqual(toolCallPresentation({ id: 'call_3', name: 'read', args: { path: 'src/App.tsx', offset: 0 } }, root), {
    headerDetail: { text: 'src/App.tsx', title: 'src/App.tsx' },
  })
})
