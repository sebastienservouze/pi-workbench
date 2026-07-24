import assert from 'node:assert/strict'
import test from 'node:test'
import { activityForPiEvent, activityText, sessionActivity } from '../src/features/conversation/activity.ts'

test('keeps a current activity through thinking, tool preparation, execution, and writing', () => {
  let activity = activityForPiEvent(null, { type: 'agent_start' })
  assert.deepEqual(activity, { kind: 'working' })

  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_start' } })
  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '**Inspecting** files' } })
  assert.deepEqual(activity, { kind: 'thinking', thinking: '**Inspecting** files' })

  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'toolcall_start' } })
  assert.deepEqual(activity, { kind: 'tool-preparing' })

  activity = activityForPiEvent(activity, { type: 'tool_execution_start', toolName: 'read' })
  assert.deepEqual(activity, { kind: 'tool-waiting' })

  activity = activityForPiEvent(activity, { type: 'tool_execution_end' })
  assert.deepEqual(activity, { kind: 'working' })

  assert.equal(activityText({ kind: 'tool-preparing' }, 'worker'), 'Worker is preparing a tool call…')
  assert.equal(activityText({ kind: 'tool-waiting' }, 'worker'), 'Worker is waiting for the tool…')
  assert.equal(activityText(activity, 'worker'), 'Worker is getting things moving…')
  assert.equal(activityText({ kind: 'thinking', thinking: '**Inspecting** files' }, undefined), 'Pi is thinking hard…')

  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Done' } })
  assert.deepEqual(activity, { kind: 'writing' })
  assert.equal(activityForPiEvent(activity, { type: 'agent_settled' }), null)
})

test('keeps thinking content out of the activity label', () => {
  let activity = activityForPiEvent(null, { type: 'message_update', assistantMessageEvent: { type: 'thinking_start' } })
  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '**Inspecting** files\n' } })
  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '**Checking** tests' } })

  assert.deepEqual(activity, { kind: 'thinking', thinking: '**Inspecting** files\n**Checking** tests' })
  assert.equal(activityText(activity, undefined), 'Pi is thinking hard…')
})

test('reports compaction until Pi continues or settles', () => {
  const compacting = activityForPiEvent({ kind: 'working' }, { type: 'compaction_start', reason: 'threshold' })

  assert.deepEqual(compacting, { kind: 'compacting' })
  assert.equal(activityText(compacting, 'pi'), 'Pi is compacting the session…')
  assert.deepEqual(activityForPiEvent(compacting, { type: 'compaction_end', reason: 'threshold' }), { kind: 'working' })
})

test('reports provider reconnection attempts', () => {
  const activity = activityForPiEvent({ kind: 'working' }, { type: 'auto_retry_start', attempt: 2, maxAttempts: 3 })

  assert.deepEqual(activity, { kind: 'retrying', attempt: 2, maxAttempts: 3 })
  assert.equal(activityText(activity, 'pi'), 'Pi is reconnecting to the provider (2/3)…')
})

test('restores reliable activity from connection and session status', () => {
  assert.deepEqual(sessionActivity(null, 'idle', 'connecting'), { kind: 'connecting' })
  assert.equal(sessionActivity(null, 'idle', 'connected'), null)
  assert.deepEqual(sessionActivity(null, 'running', 'connected'), { kind: 'working' })
  assert.deepEqual(sessionActivity({ kind: 'writing' }, 'running', 'disconnected'), { kind: 'disconnected' })
  assert.deepEqual(sessionActivity(null, 'exited', 'connected'), { kind: 'exited' })
})

test('uses playful activity labels', () => {
  assert.equal(activityText({ kind: 'disconnected' }, 'pi'), 'Pi is off the radar 📡')
  assert.equal(activityText({ kind: 'writing' }, 'pi'), 'Pi is writing…')
})
