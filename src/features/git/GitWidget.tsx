import { useState } from 'react'
import type { GitActionResult, GitFileDiff, GitRevertResult, GitSnapshot } from '../../../shared/types.ts'
import { WidgetLayout } from '../right-sidebar/WidgetLayout.tsx'
import { parseGitDiff } from './git-diff.ts'

/** Owns Git-specific selection, actions, and diff rendering inside the sidebar. */
export function GitWidget({ snapshot, onAction, onError, onFileSelect, onRefresh, onRevert }: {
  snapshot: GitSnapshot
  onAction: (message: string) => Promise<GitActionResult>
  onError: (cause: unknown) => void
  onFileSelect: (path: string, commitHash?: string) => Promise<GitFileDiff>
  onRefresh: () => void
  onRevert: (hash: string) => Promise<GitRevertResult>
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [fileDiff, setFileDiff] = useState<GitFileDiff | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const hasChanges = snapshot.files.length > 0

  /** Loads the requested diff before replacing the widget's file list. */
  async function selectFile(path: string, commitHash?: string): Promise<void> {
    setSelectedPath(path)
    try {
      setFileDiff(await onFileSelect(path, commitHash))
    } catch (cause) {
      setSelectedPath(null)
      onError(cause)
    }
  }

  /** Executes the requested Git action and preserves the message if it fails. */
  async function action(): Promise<void> {
    setBusy(true)
    try {
      const result = await onAction(message)
      if (result.committed) setMessage('')
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  /** Reverts the chosen commit after confirmation and lets Git report conflicts. */
  async function revertCommit(hash: string): Promise<void> {
    if (!window.confirm(`Revert commit ${hash.slice(0, 7)}?`)) return
    setBusy(true)
    try {
      await onRevert(hash)
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  return <WidgetLayout
    footer={!selectedPath && (hasChanges || snapshot.ahead > 0) && <form className="git-actions" onSubmit={(event) => { event.preventDefault(); void action() }}>
      {hasChanges && <input aria-label="Commit message" disabled={busy} onChange={(event) => setMessage(event.target.value)} placeholder="Commit message" value={message} />}
      <button disabled={busy || (hasChanges && !message.trim())} type="submit">{busy ? 'Git in progress…' : hasChanges ? 'Commit & push' : `Push ${snapshot.ahead} commit${snapshot.ahead > 1 ? 's' : ''}`}</button>
    </form>}
    header={fileDiff || selectedPath ? <><button aria-label="Back to Git files" className="git-back" onClick={() => { setFileDiff(null); setSelectedPath(null) }} title="Back" type="button">←</button><strong title={selectedPath ?? undefined}>{selectedPath}</strong></> : <><div><strong>{snapshot.branch}</strong><span>{hasChanges ? `${snapshot.files.length} file${snapshot.files.length > 1 ? 's' : ''} modified` : 'Clean tree'}</span></div><button aria-label="Refresh Git state" className="git-refresh" onClick={onRefresh} title="Refresh" type="button">↻</button></>}
  >
    {fileDiff || selectedPath ? fileDiff ? <GitDiff diff={fileDiff.diff} /> : <p className="git-empty">Loading diff…</p> : <>
      {hasChanges && <ul className="git-file-list">
        {snapshot.files.map((file) => <li className="git-file-item" key={file.path}>
          {file.status === 'added' || file.status === 'modified' ? <button className="git-file-button" onClick={() => void selectFile(file.path)} type="button"><GitFileRow file={file} /></button> : <GitFileRow file={file} />}
        </li>)}
      </ul>}
      {snapshot.commits.length > 0 && <section className="git-commits" aria-label="Unpushed commits">
        <h2>Unpushed commits <small>{snapshot.commits.length}</small></h2>
        {snapshot.commits.map((commit) => <div className="git-commit" key={commit.hash}>
          <details>
            <summary title={commit.subject}><code>{commit.hash.slice(0, 7)}</code><span>{commit.subject}</span></summary>
            {commit.files.length > 0 ? <ul className="git-file-list git-commit-files">{commit.files.map((file) => <li className="git-file-item" key={file.path}>
              {file.status === 'added' || file.status === 'modified' ? <button className="git-file-button" onClick={() => void selectFile(file.path, commit.hash)} type="button"><GitFileRow file={file} /></button> : <GitFileRow file={file} />}
            </li>)}</ul> : <p className="git-empty">No files modified.</p>}
          </details>
          <button aria-label={`Revert commit ${commit.hash.slice(0, 7)}`} className="git-revert" disabled={busy} onClick={() => void revertCommit(commit.hash)} title="Revert this commit" type="button">↶</button>
        </div>)}
      </section>}
      {!hasChanges && snapshot.ahead === 0 && <p className="git-empty">No changes to commit.</p>}
    </>}
  </WidgetLayout>
}

/** Displays common file metadata in Git lists. */
function GitFileRow({ file }: { file: GitSnapshot['files'][number] }) {
  return <>
    <span className={`git-file-status ${file.status}`} title={gitStatusLabel(file.status)}>{gitStatusInitial(file.status)}</span>
    <span className="git-file-path" title={file.path}>{file.path}</span>
    <span className="git-file-counts"><b>+{file.additions ?? '—'}</b><i>−{file.deletions ?? '—'}</i></span>
  </>
}

/** Displays a Git diff with line numbers before and after the change. */
function GitDiff({ diff }: { diff: string }) {
  const lines = parseGitDiff(diff)
  if (lines.length === 0) return <p className="git-empty">No textual differences to display.</p>

  return <section className="git-diff" aria-label="File diff">
    {lines.map((line, index) => <div className={`git-diff-line ${line.kind}`} key={index}>
      <span>{line.oldLine ?? ''}</span>
      <span>{line.newLine ?? ''}</span>
      <i aria-hidden="true">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</i>
      <code>{line.content}</code>
    </div>)}
  </section>
}

function gitStatusLabel(status: 'added' | 'deleted' | 'modified' | 'renamed'): string {
  return { added: 'Added', deleted: 'Deleted', modified: 'Modified', renamed: 'Renamed' }[status]
}

function gitStatusInitial(status: 'added' | 'deleted' | 'modified' | 'renamed'): string {
  return { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' }[status]
}
