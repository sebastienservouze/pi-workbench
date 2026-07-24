import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { getGitFileDiff, getGitSnapshot, mergeNumstats, parseGitStatus, revertGitCommit } from '../server/features/git/git.ts'

const execFile = promisify(execFileCallback)

test('parses Git status and combines staged and unstaged line counts', () => {
  assert.deepEqual(parseGitStatus(' M src/App.tsx\0?? new-file.ts\0R  renamed.ts\0old-name.ts\0'), [
    { path: 'src/App.tsx', status: 'modified' },
    { path: 'new-file.ts', status: 'added' },
    { path: 'renamed.ts', status: 'renamed' },
  ])

  const counts = mergeNumstats('2\t1\tsrc/App.tsx\0', '3\t0\tsrc/App.tsx\0' + '4\t0\tnew-file.ts\0')

  assert.deepEqual(counts.get('src/App.tsx'), { additions: 5, deletions: 1 })
  assert.deepEqual(counts.get('new-file.ts'), { additions: 4, deletions: 0 })
})

test('uses the destination path for renamed numstat records and preserves binary counts', () => {
  const counts = mergeNumstats('-\t-\t\0old-name.ts\0renamed.ts\0')

  assert.deepEqual(counts.get('renamed.ts'), { additions: null, deletions: null })
})

test('reports untracked files and their line additions from a worktree', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-workbench-git-'))
  try {
    await execFile('git', ['init', '--quiet'], { cwd: directory })
    await writeFile(join(directory, 'new-file.ts'), 'first line\nsecond line\n')

    const snapshot = await getGitSnapshot(directory)

    assert.equal(snapshot.repository, true)
    assert.equal(snapshot.root, directory)
    assert.deepEqual(snapshot.files, [{ path: 'new-file.ts', status: 'added', additions: 2, deletions: 0 }])
    assert.deepEqual(snapshot.commits, [])
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('returns diffs for modified and untracked files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-workbench-git-'))
  try {
    await execFile('git', ['init', '--quiet'], { cwd: directory })
    await execFile('git', ['config', 'user.email', 'test@example.com'], { cwd: directory })
    await execFile('git', ['config', 'user.name', 'Test User'], { cwd: directory })
    await writeFile(join(directory, 'tracked.ts'), 'before\n')
    await execFile('git', ['add', 'tracked.ts'], { cwd: directory })
    await execFile('git', ['commit', '--quiet', '-m', 'Initial commit'], { cwd: directory })
    await writeFile(join(directory, 'tracked.ts'), 'after\n')
    await writeFile(join(directory, 'new.ts'), 'new file\n')

    const modified = await getGitFileDiff(directory, 'tracked.ts')
    const added = await getGitFileDiff(directory, 'new.ts')

    assert.match(modified.diff, /-before\n\+after/)
    assert.match(added.diff, /\+new file/)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('reports and reverts unpushed commits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-workbench-git-'))
  const remote = await mkdtemp(join(tmpdir(), 'pi-workbench-git-remote-'))
  try {
    await execFile('git', ['init', '--bare', '--quiet'], { cwd: remote })
    await execFile('git', ['init', '--quiet'], { cwd: directory })
    await execFile('git', ['config', 'user.email', 'test@example.com'], { cwd: directory })
    await execFile('git', ['config', 'user.name', 'Test User'], { cwd: directory })
    await writeFile(join(directory, 'tracked.ts'), 'initial\n')
    await execFile('git', ['add', 'tracked.ts'], { cwd: directory })
    await execFile('git', ['commit', '--quiet', '-m', 'Initial commit'], { cwd: directory })
    await execFile('git', ['branch', '-M', 'main'], { cwd: directory })
    await execFile('git', ['remote', 'add', 'origin', remote], { cwd: directory })
    await execFile('git', ['push', '--quiet', '--set-upstream', 'origin', 'main'], { cwd: directory })
    await writeFile(join(directory, 'tracked.ts'), 'initial\nchanged\n')
    await writeFile(join(directory, 'unpushed.ts'), 'local only\n')
    await execFile('git', ['add', 'tracked.ts', 'unpushed.ts'], { cwd: directory })
    await execFile('git', ['commit', '--quiet', '-m', 'Local commit'], { cwd: directory })
    await writeFile(join(directory, 'second.ts'), 'second commit\n')
    await execFile('git', ['add', 'second.ts'], { cwd: directory })
    await execFile('git', ['commit', '--quiet', '-m', 'Second local commit'], { cwd: directory })

    const snapshot = await getGitSnapshot(directory)

    assert.equal(snapshot.ahead, 2)
    assert.deepEqual(snapshot.commits.map(({ hash: _hash, ...commit }) => commit), [
      { subject: 'Second local commit', files: [{ path: 'second.ts', status: 'added', additions: 1, deletions: 0 }] },
      {
        subject: 'Local commit',
        files: [
          { path: 'tracked.ts', status: 'modified', additions: 1, deletions: 0 },
          { path: 'unpushed.ts', status: 'added', additions: 1, deletions: 0 },
        ],
      },
    ])
    assert.match(snapshot.commits[0]?.hash ?? '', /^[0-9a-f]{40}$/)

    const commit = snapshot.commits.find(({ subject }) => subject === 'Local commit')
    const diff = await getGitFileDiff(directory, 'tracked.ts', commit?.hash)
    assert.match(diff.diff, /\+changed/)

    await revertGitCommit(directory, commit?.hash ?? '')
    const reverted = await getGitSnapshot(directory)
    const tracked = await execFile('git', ['show', 'HEAD:tracked.ts'], { cwd: directory })

    assert.equal(reverted.ahead, 3)
    assert.equal(reverted.files.length, 0)
    assert.match(reverted.commits[0]?.subject ?? '', /^Revert "Local commit"$/)
    assert.equal(tracked.stdout, 'initial\n')
  } finally {
    await rm(directory, { force: true, recursive: true })
    await rm(remote, { force: true, recursive: true })
  }
})
