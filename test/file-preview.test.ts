import assert from 'node:assert/strict'
import test from 'node:test'
import { canHighlightFile, maxHighlightedCharacters } from '../src/file-preview.ts'

test('skips syntax highlighting above 10,000 characters', () => {
  assert.equal(canHighlightFile('a'.repeat(maxHighlightedCharacters)), true)
  assert.equal(canHighlightFile('a'.repeat(maxHighlightedCharacters + 1)), false)
})
