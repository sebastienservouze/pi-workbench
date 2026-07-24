import assert from 'node:assert/strict'
import test from 'node:test'
import { readInterfaceScale } from '../src/features/settings/interface-scale.ts'

test('accepte uniquement les échelles d’interface prises en charge', () => {
  assert.equal(readInterfaceScale('1.25'), '1.25')
  assert.equal(readInterfaceScale('2'), '1')
  assert.equal(readInterfaceScale(null), '1')
})
