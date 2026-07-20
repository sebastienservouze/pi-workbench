import assert from 'node:assert/strict'
import test from 'node:test'
import { isVsCodeAvailable } from '../server/vscode.ts'

test('detects an available and an unavailable command without executing either', async () => {
  assert.equal(await isVsCodeAvailable(process.execPath), true)
  assert.equal(await isVsCodeAvailable('pi-workbench-command-that-does-not-exist'), false)
})
