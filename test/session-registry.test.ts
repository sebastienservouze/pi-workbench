import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSessionRegistry } from '../server/session-registry.ts'

test('validates the Workbench session registry', () => {
  assert.deepEqual(
    parseSessionRegistry('[{"id":"session-id","cwd":"/workspace","name":"Session 1"}]'),
    [{ id: 'session-id', cwd: '/workspace', name: 'Session 1' }],
  )
  assert.throws(
    () => parseSessionRegistry('[{"id":"session-id","cwd":"/workspace"}]'),
    /Invalid Pi Workbench session registry/,
  )
  assert.throws(
    () => parseSessionRegistry('[{"id":"same","cwd":"/a","name":"A"},{"id":"same","cwd":"/b","name":"B"}]'),
    /Duplicate session in Pi Workbench registry/,
  )
})
