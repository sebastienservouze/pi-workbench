import assert from 'node:assert/strict'
import test from 'node:test'
import { fileContextDraft, outputContextDraft } from '../src/features/conversation/context-session.ts'

test('prépare les références pour une nouvelle session sans envoyer le brouillon', () => {
  assert.equal(fileContextDraft('/workspace/src/App.tsx'), 'Fichier à examiner : `/workspace/src/App.tsx`\n\n')
  assert.equal(
    outputContextDraft('# Résultat\n\n```ts\nconst ready = true\n```'),
    'Sortie de la session précédente :\n\n> # Résultat\n> \n> ```ts\n> const ready = true\n> ```\n\n',
  )
})
