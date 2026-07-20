import assert from 'node:assert/strict'
import test from 'node:test'
import { clampGitSidebarWidth, defaultGitSidebarWidth, maxGitSidebarWidth, minGitSidebarWidth, readGitSidebarWidth } from '../src/git-sidebar.ts'

test('borne et restaure la largeur de la sidebar Git', () => {
  assert.equal(clampGitSidebarWidth(100), minGitSidebarWidth)
  assert.equal(clampGitSidebarWidth(999), maxGitSidebarWidth)
  assert.equal(clampGitSidebarWidth(320.6), 321)
  assert.equal(readGitSidebarWidth(null), defaultGitSidebarWidth)
  assert.equal(readGitSidebarWidth('invalid'), defaultGitSidebarWidth)
})
