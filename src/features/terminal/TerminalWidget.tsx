import { useState, type FormEvent } from 'react'
import type { TerminalCommandResult } from '../../../shared/types.ts'
import { executeTerminalCommand } from '../../api.ts'

/** Runs isolated commands and keeps their output for the displayed workspace. */
export function TerminalWidget({ workspacePath }: { workspacePath: string }) {
  const [command, setCommand] = useState('')
  const [results, setResults] = useState<TerminalCommandResult[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  /** Sends the current command and keeps the input on an HTTP failure. */
  async function execute(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const nextCommand = command.trim()
    if (!nextCommand || running) return
    setRunning(true)
    setError('')
    try {
      const result = await executeTerminalCommand(workspacePath, nextCommand)
      setResults((current) => [...current, result])
      setCommand('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
    }
  }

  return <>
    <header className="widget-header terminal-header">
      <div><strong>Terminal</strong><span title={workspacePath}>{workspacePath}</span></div>
      {results.length > 0 && <button onClick={() => setResults([])} type="button">Effacer</button>}
    </header>
    <div aria-live="polite" className="widget-content terminal-output">
      {results.length === 0 && !running && <div className="terminal-empty"><strong>Workspace console</strong><span>Each command starts in the current directory; changes such as <code>cd</code> are not preserved.</span></div>}
      {results.map((result, index) => <section className="terminal-result" key={index}>
        <div><span aria-hidden="true">$</span><code>{result.command}</code></div>
        {result.stdout && <pre>{result.stdout}</pre>}
        {result.stderr && <pre className="terminal-stderr">{result.stderr}</pre>}
        {result.exitCode !== 0 && <small>{result.timedOut ? 'Command stopped after 10 minutes' : `Exit code: ${result.exitCode ?? 'unknown'}`}</small>}
      </section>)}
      {running && <div className="terminal-running" role="status"><span aria-hidden="true">$</span><code>{command.trim()}</code><small>Running…</small></div>}
      {error && <p className="terminal-error" role="alert">{error}</p>}
    </div>
    <footer className="widget-footer">
      <form className="terminal-form" onSubmit={(event) => void execute(event)}>
        <span aria-hidden="true">$</span>
        <input aria-label="Command to run" autoComplete="off" disabled={running} maxLength={10_000} onChange={(event) => setCommand(event.target.value)} placeholder="npm run typecheck" spellCheck={false} value={command} />
        <button aria-label="Run command" disabled={running || !command.trim()} title="Run" type="submit">↵</button>
      </form>
    </footer>
  </>
}
