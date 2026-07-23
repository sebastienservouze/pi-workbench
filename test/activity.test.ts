import assert from 'node:assert/strict'
import test from 'node:test'
import { activityForPiEvent, activityText } from '../src/features/conversation/activity.ts'

test('keeps a current activity through thinking, tool execution, and writing', () => {
  let activity = activityForPiEvent(null, { type: 'agent_start' })
  assert.deepEqual(activity, { kind: 'working' })

  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_start' } })
  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '**Inspecting** files' } })
  assert.deepEqual(activity, { kind: 'thinking', thinking: '**Inspecting** files' })

  activity = activityForPiEvent(activity, { type: 'tool_execution_start', toolName: 'read' })
  assert.deepEqual(activity, { kind: 'tool' })

  activity = activityForPiEvent(activity, { type: 'tool_execution_end' })
  assert.deepEqual(activity, { kind: 'working' })

  assert.equal(activityText({ kind: 'tool' }, 'worker'), 'Worker utilise un outil…')
  assert.equal(activityText(activity, 'worker'), 'Worker travaille…')
  assert.equal(activityText({ kind: 'thinking', thinking: '**Inspecting** files' }, undefined), 'Pi réfléchit…')

  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Done' } })
  assert.deepEqual(activity, { kind: 'writing' })
  assert.equal(activityForPiEvent(activity, { type: 'agent_settled' }), null)
})

test('keeps thinking content out of the activity label', () => {
  let activity = activityForPiEvent(null, { type: 'message_update', assistantMessageEvent: { type: 'thinking_start' } })
  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '**Inspecting** files\n' } })
  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '**Checking** tests' } })

  assert.deepEqual(activity, { kind: 'thinking', thinking: '**Inspecting** files\n**Checking** tests' })
  assert.equal(activityText(activity, undefined), 'Pi réfléchit…')
})

test('uses generic French activity labels', () => {
  assert.equal(activityText({ kind: 'tool' }, 'pi'), 'Pi utilise un outil…')
  assert.equal(activityText({ kind: 'writing' }, 'pi'), 'Pi écrit…')
})
