import assert from 'node:assert/strict'
import test from 'node:test'
import { directoryCompletionTarget } from '../src/features/workspace/directory-completion.ts'

test('détermine le dossier et le préfixe à compléter', () => {
  assert.deepEqual(directoryCompletionTarget('~/pro'), { parentPath: '~', pathPrefix: '~/', namePrefix: 'pro' })
  assert.deepEqual(directoryCompletionTarget('/home/user/'), { parentPath: '/home/user', pathPrefix: '/home/user/', namePrefix: '' })
  assert.deepEqual(directoryCompletionTarget('/.co'), { parentPath: '/', pathPrefix: '/', namePrefix: '.co' })
  assert.equal(directoryCompletionTarget('relative/path'), null)
})
