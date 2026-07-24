import assert from 'node:assert/strict'
import test from 'node:test'
import { promptSessionTitle } from '../src/features/composer/prompt-title.ts'

test('normalizes and truncates the prompt used as the immediate session title', () => {
  assert.equal(promptSessionTitle('  First\n\tprompt  '), 'First prompt')
  assert.equal(promptSessionTitle('a'.repeat(100)), `${'a'.repeat(89)}…`)
})
