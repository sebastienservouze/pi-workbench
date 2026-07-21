import { useMemo, useState } from 'react'
import type { CommandId } from './command-registry.ts'

export interface PaletteCommand {
  id: CommandId
  label: string
  shortcut?: string
  disabled?: boolean
  onExecute: () => void
}

/** Permet de rechercher et d’exécuter les commandes disponibles sans quitter le clavier. */
export function CommandPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase())), [commands, query])

  return <div className="command-palette-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section aria-label="Palette de commandes" className="command-palette" role="dialog">
      <input autoFocus aria-label="Rechercher une commande" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }} placeholder="Rechercher une commande…" value={query} />
      <div className="command-palette-list">
        {filtered.map((command) => <button disabled={command.disabled} key={command.id} onClick={() => { command.onExecute(); onClose() }} type="button"><span><strong>{command.label}</strong>{command.disabled && <small>Indisponible</small>}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>)}
        {filtered.length === 0 && <p>Aucune commande trouvée.</p>}
      </div>
    </section>
  </div>
}
