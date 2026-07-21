import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { listDirectories } from '../../api.ts'
import { directoryCompletionTarget } from './directory-completion.ts'

/** Permet de compléter puis valider un chemin local avant de changer l'espace de travail. */
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

  // Les requêtes obsolètes ne doivent pas remplacer les suggestions du chemin actuellement saisi.
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

  /** Valide que le chemin est toujours accessible avant de l'adopter comme workspace. */
  function selectDirectory(nextPath: string): void {
    void listDirectories(nextPath).then((directory) => onSelect(directory.path)).catch(onError)
  }

  /** Applique les raccourcis habituels d'une liste de complétion sans intercepter la saisie normale. */
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
        <h2 id="directory-picker-title">Choisir un dossier</h2>
        <label className="directory-path-label" htmlFor="directory-path">Chemin du dossier</label>
        <input
          aria-activedescendant={activeSuggestion >= 0 ? `directory-suggestion-${activeSuggestion}` : undefined}
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
        <p className="directory-path-hint">Tab complète · ↑↓ parcourent · Entrée valide · Échap annule</p>
        {suggestions.length > 0 && <div aria-label="Suggestions de dossiers" className="directory-suggestions" id="directory-suggestions" role="listbox">
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
        {recentPaths.length > 0 && <section aria-label="Workspaces récents" className="recent-workspaces">
          <strong>Workspaces récents</strong>
          <div>{recentPaths.map((recentPath) => <button key={recentPath} onClick={() => selectDirectory(recentPath)} type="button">{recentPath}</button>)}</div>
        </section>}
        <div className="modal-actions"><button onClick={onClose} type="button">Annuler</button><button className="primary" onClick={() => selectDirectory(path)} type="button">Ouvrir</button></div>
      </section>
    </div>
  )
}
