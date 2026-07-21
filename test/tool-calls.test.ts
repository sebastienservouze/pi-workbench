import assert from 'node:assert/strict'
import test from 'node:test'
import { editOperations, formatToolCallTooltip, formatToolData, isToolCallPending, readContentDisplay, toolCallInUpdate, toolCallPresentation, toolCallsInMessage, toolContentText, toolFilePath, toolResultInMessage, truncateToolText } from '../src/features/conversation/tool-calls.ts'

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

test('extracts a tool call before its execution starts', () => {
  assert.deepEqual(toolCallInUpdate({
    type: 'message_update',
    assistantMessageEvent: {
      type: 'toolcall_end',
      toolCall: { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'src/App.tsx' } },
    },
  }), { id: 'call_1', name: 'read', args: { path: 'src/App.tsx' } })
  assert.equal(toolCallInUpdate({ type: 'message_update', assistantMessageEvent: { type: 'text_delta' } }), null)
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

test('adds input and output sizes below the full tool title', () => {
  assert.equal(formatToolCallTooltip('pwd', 'abc'), 'pwd\nAppel : 3 caractères')
  assert.equal(formatToolCallTooltip('pwd', 'abc', 'de'), 'pwd\nAppel : 3 caractères · Résultat : 2 caractères')
})

test('truncates text only after 140 characters', () => {
  const limit = 'a'.repeat(140)
  assert.deepEqual(truncateToolText(limit), { text: limit, truncated: false })
  assert.deepEqual(truncateToolText(`${limit}b`), { text: `${limit}…`, truncated: true })
})

test('validates edit operations before rendering their diff', () => {
  assert.deepEqual(editOperations({
    path: 'src/App.tsx',
    edits: [
      { oldText: 'before', newText: 'after' },
      { oldText: '', newText: 'added' },
      { oldText: 'removed', newText: '' },
    ],
  }), [
    { oldText: 'before', newText: 'after' },
    { oldText: '', newText: 'added' },
    { oldText: 'removed', newText: '' },
  ])
  assert.equal(editOperations({ edits: [] }), null)
  assert.equal(editOperations({ edits: [{ oldText: 'before' }] }), null)
})

test('detects Markdown, HTML and supported code formats read from the repository', () => {
  assert.deepEqual(readContentDisplay({ path: 'docs/guide.md' }), { kind: 'markdown' })
  assert.deepEqual(readContentDisplay({ path: 'src/App.tsx' }), { kind: 'code', language: 'typescript' })
  assert.deepEqual(readContentDisplay({ path: 'public/preview.html' }), { kind: 'html' })
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
    pendingDetail: 'timeout : 30s',
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
