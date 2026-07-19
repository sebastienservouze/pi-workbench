import assert from 'node:assert/strict'
import test from 'node:test'
import { activityForPiEvent, activityText } from '../src/activity.ts'

test('keeps a current activity through thinking, tool execution, and writing', () => {
  let activity = activityForPiEvent(null, { type: 'agent_start' })
  assert.deepEqual(activity, { kind: 'working' })

  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_start' } })
  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '**Inspecting** files' } })
  assert.deepEqual(activity, { kind: 'thinking', thinking: '**Inspecting** files' })

  activity = activityForPiEvent(activity, { type: 'tool_execution_start', toolName: 'read' })
  assert.deepEqual(activity, { kind: 'tool', toolName: 'read' })

  activity = activityForPiEvent(activity, { type: 'tool_execution_end' })
  assert.deepEqual(activity, { kind: 'working' })

  assert.equal(activityText(activity, 'worker'), 'Worker travaille…')
  assert.equal(activityText({ kind: 'thinking', thinking: '**Inspecting** files' }, undefined), 'Pi réfléchit — Inspecting files')

  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Done' } })
  assert.deepEqual(activity, { kind: 'writing' })
  assert.equal(activityForPiEvent(activity, { type: 'agent_settled' }), null)
})
