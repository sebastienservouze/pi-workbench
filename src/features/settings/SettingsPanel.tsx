import { useState } from 'react'
import type { CommandDefinition, CommandId } from '../commands/command-registry.ts'
import { shortcutFromEvent, shortcutConflicts } from '../commands/command-registry.ts'

/** Configure les raccourcis locaux de Pi Workbench et permet de restaurer les valeurs initiales. */
export function SettingsPanel({ definitions, shortcuts, onChange, onReset, onClose }: { definitions: CommandDefinition[]; shortcuts: Partial<Record<CommandId, string>>; onChange: (id: CommandId, shortcut: string) => void; onReset: () => void; onClose: () => void }) {
  const [capturing, setCapturing] = useState<CommandId | null>(null)
  const conflicts = shortcutConflicts(shortcuts)
  return <div className="settings-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section aria-label="Paramètres" className="settings-panel" role="dialog">
      <header><div><span>Préférences</span><h2>Paramètres</h2></div><button aria-label="Fermer les paramètres" onClick={onClose} type="button">×</button></header>
      <section><h3>Raccourcis</h3>{definitions.filter(({ id }) => !['open-palette', 'open-settings'].includes(id)).map((definition) => <label className={conflicts.has(definition.id) ? 'shortcut-row conflict' : 'shortcut-row'} key={definition.id}><span>{definition.label}{conflicts.has(definition.id) && <small>Conflit</small>}</span><input aria-label={`Raccourci : ${definition.label}`} onBlur={() => setCapturing(null)} onKeyDown={(event) => { event.preventDefault(); if (event.key === 'Escape') { setCapturing(null); return } const value = shortcutFromEvent(event); if (value !== event.key.toLowerCase()) { onChange(definition.id, value); setCapturing(null) } }} onFocus={() => setCapturing(definition.id)} placeholder="Non assigné" readOnly value={capturing === definition.id ? 'Appuyez sur une touche…' : shortcuts[definition.id] ?? ''} /></label>)}</section>
      <footer><button onClick={onReset} type="button">Restaurer les raccourcis</button><button className="primary" onClick={onClose} type="button">Terminé</button></footer>
    </section>
  </div>
}
