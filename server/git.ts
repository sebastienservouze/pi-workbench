import { spawn } from 'node:child_process'
import type { GitCommit, GitFileChange, GitFileDiff, GitRevertResult, GitSnapshot } from '../shared/types.ts'

interface GitCommandResult {
  exitCode: number
  stderr: string
  stdout: string
}

/** Aggregates Git state, file statistics, and the number of commits waiting to be pushed. */
export async function getGitSnapshot(cwd: string): Promise<GitSnapshot> {
  const repository = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'], [0, 128])
  if (repository.exitCode !== 0 || repository.stdout.trim() !== 'true') return { repository: false, root: null, branch: null, files: [], ahead: 0, commits: [] }

  const [root, status, unstaged, staged, branch, upstream] = await Promise.all([
    runGit(cwd, ['rev-parse', '--show-toplevel']),
    runGit(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    runGit(cwd, ['diff', '--numstat', '-z']),
    runGit(cwd, ['diff', '--cached', '--numstat', '-z']),
    runGit(cwd, ['branch', '--show-current']),
    runGit(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], [0, 128]),
  ])

  const changes = parseGitStatus(status.stdout)
  const counts = mergeNumstats(unstaged.stdout, staged.stdout)
  await Promise.all(changes.filter((change) => change.status === 'added' && !counts.has(change.path)).map(async (change) => {
    const result = await runGit(cwd, ['diff', '--no-index', '--numstat', '-z', '--', '/dev/null', change.path], [0, 1])
    const [count] = parseNumstat(result.stdout)
    if (count) counts.set(change.path, { additions: count.additions, deletions: count.deletions })
  }))

  const commits = upstream.exitCode === 0 ? await unpushedCommits(cwd) : []

  return {
    repository: true,
    root: root.stdout.trim() || null,
    branch: branch.stdout.trim() || 'HEAD',
    files: changes.map((change) => {
      const count = counts.get(change.path)
      return { ...change, additions: count?.additions ?? null, deletions: count?.deletions ?? null }
    }),
    ahead: commits.length,
    commits,
  }
}

/** Returns the unified diff for a modified or added file in the tree or an unpushed commit. */
export async function getGitFileDiff(cwd: string, path: string, commitHash?: string): Promise<GitFileDiff> {
  const snapshot = await getGitSnapshot(cwd)
  if (commitHash) {
    const commit = snapshot.commits.find(({ hash }) => hash === commitHash)
    const file = commit?.files.find((change) => change.path === path)
    if (!file || (file.status !== 'added' && file.status !== 'modified')) throw new Error('This file cannot be displayed.')
    const result = await runGit(cwd, ['diff-tree', '--no-commit-id', '--root', '--first-parent', '-m', '-p', commitHash, '--', path])
    return { path, diff: result.stdout }
  }

  const file = snapshot.files.find((change) => change.path === path)
  if (!file || (file.status !== 'added' && file.status !== 'modified')) throw new Error('This file cannot be displayed.')

  const trackedDiff = await runGit(cwd, ['diff', 'HEAD', '--', path], [0, 128])
  if (trackedDiff.stdout) return { path, diff: trackedDiff.stdout }

  const untrackedDiff = await runGit(cwd, ['diff', '--no-index', '--', '/dev/null', path], [0, 1])
  return { path, diff: untrackedDiff.stdout }
}

/** Lists commits after the tracked branch and each commit's files. */
async function unpushedCommits(cwd: string): Promise<GitCommit[]> {
  const result = await runGit(cwd, ['log', '--format=%H%x00%s%x00', '@{upstream}..HEAD'])
  const fields = result.stdout.split('\0')
  const commits: GitCommit[] = []

  for (let index = 0; index < fields.length - 1; index += 2) {
    const hash = fields[index].trim()
    const subject = fields[index + 1]
    if (!hash) continue
    commits.push({ hash, subject, files: [] })
  }

  await Promise.all(commits.map(async (commit) => {
    const [status, stats] = await Promise.all([
      runGit(cwd, ['diff-tree', '--no-commit-id', '--name-status', '-r', '-m', '--first-parent', '-z', commit.hash]),
      runGit(cwd, ['diff-tree', '--no-commit-id', '--numstat', '-r', '-m', '--first-parent', '-z', commit.hash]),
    ])
    const counts = mergeNumstats(stats.stdout)
    commit.files = parseGitNameStatus(status.stdout).map((change) => {
      const count = counts.get(change.path)
      return { ...change, additions: count?.additions ?? null, deletions: count?.deletions ?? null }
    })
  }))

  return commits
}

/** Reverts a displayed local commit by creating its inverse without rewriting history. */
export async function revertGitCommit(cwd: string, hash: string): Promise<GitRevertResult> {
  const snapshot = await getGitSnapshot(cwd)
  if (!snapshot.repository) throw new Error('The current directory is not a Git repository.')
  if (snapshot.files.length > 0) throw new Error('The repository must be clean before reverting a commit.')
  if (!snapshot.commits.some((commit) => commit.hash === hash)) throw new Error('This commit cannot be reverted.')

  await runGit(cwd, ['revert', '--no-edit', hash])
  return { hash }
}

/** Commits current changes and tries to push, or pushes commits already ahead. */
export async function commitAndPush(cwd: string, message: string): Promise<{ committed: boolean; pushed: boolean; pushError?: string }> {
  const snapshot = await getGitSnapshot(cwd)
  if (!snapshot.repository) throw new Error('The current directory is not a Git repository.')

  if (snapshot.files.length > 0) {
    if (!message.trim()) throw new Error('A commit message is required.')
    await runGit(cwd, ['add', '-A'])
    await runGit(cwd, ['commit', '-m', message.trim()])
    const push = await runGit(cwd, ['push'], [0, 1])
    return push.exitCode === 0
      ? { committed: true, pushed: true }
      : { committed: true, pushed: false, pushError: gitError(push) }
  }

  if (snapshot.ahead === 0) throw new Error('There are no changes or commits to push.')
  const push = await runGit(cwd, ['push'], [0, 1])
  return push.exitCode === 0
    ? { committed: false, pushed: true }
    : { committed: false, pushed: false, pushError: gitError(push) }
}

export function parseGitStatus(output: string): Omit<GitFileChange, 'additions' | 'deletions'>[] {
  const fields = output.split('\0')
  const changes: Omit<GitFileChange, 'additions' | 'deletions'>[] = []
  for (let index = 0; index < fields.length - 1; index += 1) {
    const field = fields[index]
    if (!field) continue
    const code = field.slice(0, 2)
    const path = field.slice(3)
    if (code.includes('R') || code.includes('C')) index += 1
    changes.push({ path, status: statusFor(code) })
  }
  return changes
}

export function parseGitNameStatus(output: string): Omit<GitFileChange, 'additions' | 'deletions'>[] {
  const fields = output.split('\0')
  const changes: Omit<GitFileChange, 'additions' | 'deletions'>[] = []

  for (let index = 0; index < fields.length - 1; index += 1) {
    const code = fields[index]
    const path = fields[++index]
    if (!code || !path) continue
    if (code.startsWith('R') || code.startsWith('C')) {
      const newPath = fields[++index]
      if (newPath) changes.push({ path: newPath, status: statusFor(code) })
      continue
    }
    changes.push({ path, status: statusFor(code) })
  }

  return changes
}

export function mergeNumstats(...outputs: string[]): Map<string, Pick<GitFileChange, 'additions' | 'deletions'>> {
  const counts = new Map<string, Pick<GitFileChange, 'additions' | 'deletions'>>()
  for (const output of outputs) {
    for (const count of parseNumstat(output)) {
      const current = counts.get(count.path)
      counts.set(count.path, {
        additions: current?.additions !== null && current?.additions !== undefined && count.additions !== null ? current.additions + count.additions : count.additions,
        deletions: current?.deletions !== null && current?.deletions !== undefined && count.deletions !== null ? current.deletions + count.deletions : count.deletions,
      })
    }
  }
  return counts
}

function parseNumstat(output: string): (Pick<GitFileChange, 'additions' | 'deletions'> & { path: string })[] {
  const fields = output.split('\0')
  const counts: (Pick<GitFileChange, 'additions' | 'deletions'> & { path: string })[] = []
  for (let index = 0; index < fields.length - 1; index += 1) {
    const field = fields[index]
    if (!field) continue
    const [additions, deletions, path] = field.split('\t')
    if (path) {
      counts.push({ path, additions: numberOrNull(additions), deletions: numberOrNull(deletions) })
      continue
    }
    const oldPath = fields[++index]
    const newPath = fields[++index]
    if (oldPath && newPath) counts.push({ path: newPath, additions: numberOrNull(additions), deletions: numberOrNull(deletions) })
  }
  return counts
}

function statusFor(code: string): GitFileChange['status'] {
  if (code === '??' || code.includes('A')) return 'added'
  if (code.includes('D')) return 'deleted'
  if (code.includes('R')) return 'renamed'
  return 'modified'
}

function numberOrNull(value: string): number | null {
  const number = Number.parseInt(value, 10)
  return Number.isNaN(number) ? null : number
}

async function runGit(cwd: string, args: string[], allowedExitCodes = [0]): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    const process = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    process.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    process.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    process.once('error', reject)
    process.once('close', (exitCode) => {
      const result = { exitCode: exitCode ?? 1, stdout, stderr }
      if (allowedExitCodes.includes(result.exitCode)) resolve(result)
      else reject(new Error(gitError(result)))
    })
  })
}

function gitError(result: GitCommandResult): string {
  return result.stderr.trim() || result.stdout.trim() || 'The Git command failed.'
}
