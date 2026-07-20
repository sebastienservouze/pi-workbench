import assert from 'node:assert/strict'
import test from 'node:test'
import { clampGitSidebarWidth, defaultGitSidebarWidth, maxGitSidebarWidth, minGitSidebarWidth, parseGitDiff, readGitSidebarWidth } from '../src/git-sidebar.ts'

test('borne et restaure la largeur de la sidebar Git', () => {
  assert.equal(maxGitSidebarWidth, 720)
  assert.equal(clampGitSidebarWidth(100), minGitSidebarWidth)
  assert.equal(clampGitSidebarWidth(999), maxGitSidebarWidth)
  assert.equal(clampGitSidebarWidth(320.6), 321)
  assert.equal(readGitSidebarWidth(null), defaultGitSidebarWidth)
  assert.equal(readGitSidebarWidth('invalid'), defaultGitSidebarWidth)
})

test('parse un diff unifié sans ses métadonnées Git', () => {
  const lines = parseGitDiff('diff --git a/file.ts b/file.ts\nindex 123..456 100644\n--- a/file.ts\n+++ b/file.ts\n@@ -2,2 +2,3 @@\n keep\n-old\n+new\n+added\n')

  assert.deepEqual(lines, [
    { content: '@@ -2,2 +2,3 @@', kind: 'hunk', oldLine: null, newLine: null },
    { content: 'keep', kind: 'context', oldLine: 2, newLine: 2 },
    { content: 'old', kind: 'removed', oldLine: 3, newLine: null },
    { content: 'new', kind: 'added', oldLine: null, newLine: 3 },
    { content: 'added', kind: 'added', oldLine: null, newLine: 4 },
  ])
})
