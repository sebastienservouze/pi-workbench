import { useState } from 'react'
import type { CommandDefinition, CommandId } from '../commands/command-registry.ts'
import { shortcutFromEvent, shortcutConflicts } from '../commands/command-registry.ts'
import { interfaceScaleOptions, readInterfaceScale, type InterfaceScale } from './interface-scale.ts'

/** Configures Pi Livecraft local preferences and restores shortcut defaults. */
export function SettingsPanel({ definitions, interfaceScale, shortcuts, onChange, onInterfaceScaleChange, onReset, onClose }: { definitions: CommandDefinition[]; interfaceScale: InterfaceScale; shortcuts: Partial<Record<CommandId, string>>; onChange: (id: CommandId, shortcut: string) => void; onInterfaceScaleChange: (scale: InterfaceScale) => void; onReset: () => void; onClose: () => void }) {
  const [capturing, setCapturing] = useState<CommandId | null>(null)
  const conflicts = shortcutConflicts(shortcuts)
  return <div className="settings-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section aria-label="Settings" className="settings-panel" role="dialog">
      <header><div><span>Preferences</span><h2>Settings</h2></div><button aria-label="Close settings" onClick={onClose} type="button">×</button></header>
      <section className="settings-content">
        <h3>Appearance</h3>
        <label className="setting-row"><span>Interface size<small>Enlarges text, controls, and panels.</small></span><select onChange={(event) => onInterfaceScaleChange(readInterfaceScale(event.target.value))} value={interfaceScale}>{interfaceScaleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <h3 className="settings-section-heading">Shortcuts</h3>
        {definitions.filter(({ id }) => !['open-palette', 'open-settings'].includes(id)).map((definition) => <label className={conflicts.has(definition.id) ? 'shortcut-row conflict' : 'shortcut-row'} key={definition.id}><span>{definition.label}{conflicts.has(definition.id) && <small>Conflict</small>}</span><input aria-label={`Shortcut: ${definition.label}`} onBlur={() => setCapturing(null)} onKeyDown={(event) => { event.preventDefault(); if (event.key === 'Escape') { setCapturing(null); return } const value = shortcutFromEvent(event); if (value !== event.key.toLowerCase()) { onChange(definition.id, value); setCapturing(null) } }} onFocus={() => setCapturing(definition.id)} placeholder="Unassigned" readOnly value={capturing === definition.id ? 'Press a key…' : shortcuts[definition.id] ?? ''} /></label>)}
      </section>
      <footer><button onClick={onReset} type="button">Reset shortcuts</button><button className="primary" onClick={onClose} type="button">Done</button></footer>
    </section>
  </div>
}
