import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultInterfaceScale, readInterfaceScale } from '../src/features/settings/interface-scale.ts'

test('adapte l’échelle initiale à la résolution physique estimée', () => {
  assert.equal(defaultInterfaceScale(1080, 1), '1')
  assert.equal(defaultInterfaceScale(1152, 1.25), '1.125')
  assert.equal(defaultInterfaceScale(1440, 1.5), '1.25')
})

test('accepte uniquement les échelles d’interface prises en charge', () => {
  assert.equal(readInterfaceScale('1.25'), '1.25')
  assert.equal(readInterfaceScale('2', '1.125'), '1.125')
  assert.equal(readInterfaceScale(null), '1')
})
