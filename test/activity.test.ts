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
  assert.deepEqual(activity, { kind: 'tool', toolName: 'read' })

  activity = activityForPiEvent(activity, { type: 'tool_execution_end' })
  assert.deepEqual(activity, { kind: 'working' })

  assert.equal(activityText({ kind: 'tool', toolName: 'read' }, 'worker'), 'Worker lit un fichier')
  assert.equal(activityText(activity, 'worker'), 'Worker travaille…')
  assert.equal(activityText({ kind: 'thinking', thinking: '**Inspecting** files' }, undefined), 'Pi réfléchit — Inspecting files')

  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Done' } })
  assert.deepEqual(activity, { kind: 'writing' })
  assert.equal(activityForPiEvent(activity, { type: 'agent_settled' }), null)
})

test('shows only the last thinking line across successive deltas', () => {
  let activity = activityForPiEvent(null, { type: 'message_update', assistantMessageEvent: { type: 'thinking_start' } })
  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '**Inspecting** files\n' } })
  activity = activityForPiEvent(activity, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '**Checking** tests' } })

  assert.deepEqual(activity, { kind: 'thinking', thinking: '**Inspecting** files\n**Checking** tests' })
  assert.equal(activityText(activity, undefined), 'Pi réfléchit — Checking tests')
})

test('uses a French activity label for every configured tool and preserves unknown names', () => {
  const labels = {
    ask_user_question: 'vous pose une question',
    find: 'repère les fichiers pertinents',
    grep: 'cherche dans le code',
    read: 'lit un fichier',
    write: 'écrit un fichier',
    edit: 'modifie un fichier',
    bash: 'exécute une commande',
    web_search: 'recherche sur le web',
    fetch_content: 'consulte du contenu',
  }

  for (const [toolName, label] of Object.entries(labels)) {
    assert.equal(activityText({ kind: 'tool', toolName }, 'pi'), `Pi ${label}`)
  }
  assert.equal(activityText({ kind: 'tool', toolName: 'new_tool' }, 'pi'), 'Pi utilise new_tool')
})
