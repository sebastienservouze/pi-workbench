import { useMemo, useState } from 'react'
import type { CommandId } from './command-registry.ts'

export interface PaletteCommand {
  id: CommandId
  label: string
  shortcut?: string
  disabled?: boolean
  onExecute: () => void
}

/** Searches and executes available commands without leaving the keyboard. */
export function CommandPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase())), [commands, query])

  return <div className="command-palette-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section aria-label="Command palette" className="command-palette" role="dialog">
      <input autoFocus aria-label="Search commands" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }} placeholder="Search commands…" value={query} />
      <div className="command-palette-list">
        {filtered.map((command) => <button disabled={command.disabled} key={command.id} onClick={() => { command.onExecute(); onClose() }} type="button"><span><strong>{command.label}</strong>{command.disabled && <small>Unavailable</small>}</span>{command.shortcut && <kbd>{command.shortcut}</kbd>}</button>)}
        {filtered.length === 0 && <p>No commands found.</p>}
      </div>
    </section>
  </div>
}
