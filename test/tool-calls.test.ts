import assert from 'node:assert/strict'
import test from 'node:test'
import { formatToolData, isToolCallPending, toolCallInUpdate, toolCallPresentation, toolCallsInMessage, toolContentText, toolResultInMessage, truncateToolText } from '../src/tool-calls.ts'

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

test('truncates tool content only after 140 characters', () => {
  const limit = 'a'.repeat(140)
  assert.deepEqual(truncateToolText(limit), { text: limit, truncated: false })
  assert.deepEqual(truncateToolText(`${limit}b`), { text: `${limit}…`, truncated: true })
})

test('uses the Bash presentation while preserving the generic fallback', () => {
  const command = 'a'.repeat(81)
  assert.deepEqual(toolCallPresentation({ id: 'call_1', name: 'bash', args: { command, timeout: 30 } }), {
    headerDetail: { text: `${'a'.repeat(80)}…`, title: command },
    pendingDetail: 'timeout : 30s',
    showInput: false,
  })
  assert.deepEqual(toolCallPresentation({ id: 'call_2', name: 'read', args: { path: 'src/App.tsx' } }), {
    showInput: true,
    outputLabel: 'Résultat',
  })
  assert.deepEqual(toolCallPresentation({ id: 'call_3', name: 'bash', args: { timeout: 30 } }), {
    showInput: true,
    outputLabel: 'Résultat',
  })
})
