import assert from 'node:assert/strict'
import { basename } from 'node:path'
import test from 'node:test'
import { isVsCodeAvailable, windowsWorkspacePath } from '../server/vscode.ts'

test('detects an available and an unavailable command without executing either', async () => {
  assert.equal(await isVsCodeAvailable(process.execPath), true)
  assert.equal(await isVsCodeAvailable('pi-workbench-command-that-does-not-exist'), false)
})

test('converts a WSL workspace into a Windows path', async () => {
  const path = await windowsWorkspacePath(process.cwd())
  assert.ok(path.includes('\\'))
  assert.match(path, new RegExp(`${basename(process.cwd())}$`, 'i'))
})
