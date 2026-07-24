import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { listDirectories } from '../../api.ts'
import { directoryCompletionTarget } from './directory-completion.ts'

/** Completes and validates a local path before changing the workspace. */
export function DirectoryPicker({ initialPath, recentPaths, onClose, onError, onSelect }: {
  initialPath: string
  recentPaths: string[]
  onClose: () => void
  onError: (cause: unknown) => void
  onSelect: (path: string) => void
}) {
  const [path, setPath] = useState(initialPath)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const completionVersionRef = useRef(0)

  // Stale requests must not replace suggestions for the path currently being entered.
  useEffect(() => {
    const version = ++completionVersionRef.current
    const target = directoryCompletionTarget(path)
    if (!target) {
      setSuggestions([])
      return
    }

    void listDirectories(target.parentPath).then((parent) => {
      if (version !== completionVersionRef.current) return
      setSuggestions(parent.directories
        .filter((directory) => directory.name.startsWith(target.namePrefix))
        .map((directory) => `${target.pathPrefix}${directory.name}`)
        .filter((completion) => completion !== path.trim()))
      setActiveSuggestion(-1)
    }).catch(() => {
      if (version === completionVersionRef.current) setSuggestions([])
    })
  }, [path])

  const visibleRecentPaths = recentPaths.filter((recentPath) => recentPath !== initialPath)

  /** Verifies that the path is still accessible before adopting it as the workspace. */
  function selectDirectory(nextPath: string): void {
    void listDirectories(nextPath).then((directory) => onSelect(directory.path)).catch(onError)
  }

  /** Applies standard completion-list shortcuts without intercepting normal input. */
  function handlePathKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return
      event.preventDefault()
      setActiveSuggestion((current) => event.key === 'ArrowDown'
        ? Math.min(current + 1, suggestions.length - 1)
        : Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Tab') {
      const suggestion = suggestions[activeSuggestion >= 0 ? activeSuggestion : 0]
      if (!suggestion) return
      event.preventDefault()
      setPath(suggestion)
      setActiveSuggestion(-1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      selectDirectory(path)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="directory-picker-title" aria-modal="true" className="modal directory-picker" role="dialog">
        <h2 id="directory-picker-title">Choose a directory</h2>
        <label className="directory-path-label" htmlFor="directory-path">Directory path</label>
        <input
          aria-activedescendant={activeSuggestion >= 0 ? `directory-suggestion-${activeSuggestion}` : undefined}
          autoComplete="off"
          autoFocus
          aria-autocomplete="list"
          aria-controls={suggestions.length > 0 ? 'directory-suggestions' : undefined}
          aria-expanded={suggestions.length > 0}
          className="directory-path-input"
          id="directory-path"
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={handlePathKeyDown}
          placeholder="~/projets ou /chemin/absolu"
          role="combobox"
          value={path}
        />
        <p className="directory-path-hint">Tab completes · ↑↓ navigate · Enter selects · Escape cancels</p>
        {suggestions.length > 0 && <div aria-label="Directory suggestions" className="directory-suggestions" id="directory-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => <div
            aria-selected={index === activeSuggestion}
            className={index === activeSuggestion ? 'active' : undefined}
            id={`directory-suggestion-${index}`}
            key={suggestion}
            onClick={() => { setPath(suggestion); setActiveSuggestion(-1) }}
            onMouseDown={(event) => event.preventDefault()}
            role="option"
          >{suggestion}</div>)}
        </div>}
        {visibleRecentPaths.length > 0 && <section aria-label="Recent workspaces" className="recent-workspaces">
          <strong>Recent workspaces</strong>
          <div>{visibleRecentPaths.map((recentPath) => <button key={recentPath} onClick={() => selectDirectory(recentPath)} type="button">{recentPath}</button>)}</div>
        </section>}
        <div className="modal-actions"><button onClick={onClose} type="button">Cancel</button><button className="primary" onClick={() => selectDirectory(path)} type="button">Open</button></div>
      </section>
    </div>
  )
}
