import assert from 'node:assert/strict'
import test from 'node:test'
import { recentWorkspaces } from '../src/features/workspace/recent-workspaces.ts'

test('place le workspace sélectionné en tête sans doublon et conserve les cinq plus récents', () => {
  assert.deepEqual(
    recentWorkspaces('/five', ['/one', '/two', '/five', '/three', '/four', '/six']),
    ['/five', '/one', '/two', '/three', '/four'],
  )
})
