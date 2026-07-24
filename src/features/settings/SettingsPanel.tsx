import { useState } from 'react'
import type { CommandDefinition, CommandId } from '../commands/command-registry.ts'
import { shortcutFromEvent, shortcutConflicts } from '../commands/command-registry.ts'

/** Configures Pi Workbench local shortcuts and restores their initial values. */
export function SettingsPanel({ definitions, shortcuts, onChange, onReset, onClose }: { definitions: CommandDefinition[]; shortcuts: Partial<Record<CommandId, string>>; onChange: (id: CommandId, shortcut: string) => void; onReset: () => void; onClose: () => void }) {
  const [capturing, setCapturing] = useState<CommandId | null>(null)
  const conflicts = shortcutConflicts(shortcuts)
  return <div className="settings-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section aria-label="Settings" className="settings-panel" role="dialog">
      <header><div><span>Preferences</span><h2>Settings</h2></div><button aria-label="Close settings" onClick={onClose} type="button">×</button></header>
      <section><h3>Shortcuts</h3>{definitions.filter(({ id }) => !['open-palette', 'open-settings'].includes(id)).map((definition) => <label className={conflicts.has(definition.id) ? 'shortcut-row conflict' : 'shortcut-row'} key={definition.id}><span>{definition.label}{conflicts.has(definition.id) && <small>Conflict</small>}</span><input aria-label={`Shortcut: ${definition.label}`} onBlur={() => setCapturing(null)} onKeyDown={(event) => { event.preventDefault(); if (event.key === 'Escape') { setCapturing(null); return } const value = shortcutFromEvent(event); if (value !== event.key.toLowerCase()) { onChange(definition.id, value); setCapturing(null) } }} onFocus={() => setCapturing(definition.id)} placeholder="Unassigned" readOnly value={capturing === definition.id ? 'Press a key…' : shortcuts[definition.id] ?? ''} /></label>)}</section>
      <footer><button onClick={onReset} type="button">Reset shortcuts</button><button className="primary" onClick={onClose} type="button">Done</button></footer>
    </section>
  </div>
}
