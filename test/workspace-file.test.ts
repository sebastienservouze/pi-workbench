import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkspaceFileError, readWorkspaceFile } from '../server/workspace-file.ts'

test('reads a text file from the workspace and rejects its root', async () => {
  const file = await readWorkspaceFile(process.cwd(), 'package.json')

  assert.equal(file.path.endsWith('/package.json'), true)
  assert.match(file.content, /"name": "pi-livecraft"/)
  await assert.rejects(readWorkspaceFile(process.cwd(), '.'), (error: unknown) => {
    assert.equal(error instanceof WorkspaceFileError, true)
    assert.equal((error as WorkspaceFileError).status, 403)
    return true
  })
})
