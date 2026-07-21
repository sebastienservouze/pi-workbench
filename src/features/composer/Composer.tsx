import * as Select from '@radix-ui/react-select'
import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type FormEvent, type RefObject } from 'react'
import type { JsonObject, SessionSnapshot, SessionSummary } from '../../../shared/types.ts'
import { maxComposerImages, prepareComposerImage, type ComposerImage } from './composer-images.ts'

/** Fournit la saisie utilisateur et les commandes de session tout en reflétant l'état Pi courant. */
export function Composer({ session, snapshot, agentBusy, agentOptions, selectedAgent, agentLoading, showAgentSelector, onAgentChange, onCommand, commands, running, onSend, onAbort, onError, requestedSelect, onSelectOpened, submitRequest = 0 }: {
  session: SessionSummary
  snapshot: SessionSnapshot
  agentBusy: boolean
  agentOptions: string[]
  selectedAgent: string
  agentLoading: boolean
  showAgentSelector: boolean
  onAgentChange: (agent: string) => void
  onCommand: (command: JsonObject) => Promise<JsonObject>
  commands: JsonObject[]
  running: boolean
  onSend: (message: string, images: JsonObject[], behavior: 'steer' | 'followUp') => Promise<void>
  onAbort: () => Promise<JsonObject>
  onError: (cause: unknown) => void
  requestedSelect?: 'agent' | 'model' | 'thinking' | null
  onSelectOpened?: () => void
  submitRequest?: number
}) {
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<ComposerImage[]>([])
  const [preparingImages, setPreparingImages] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [openSelect, setOpenSelect] = useState<'agent' | 'model' | 'thinking' | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const agentTriggerRef = useRef<HTMLButtonElement>(null)
  const modelTriggerRef = useRef<HTMLButtonElement>(null)
  const thinkingTriggerRef = useRef<HTMLButtonElement>(null)
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const [slashIndex, setSlashIndex] = useState(-1)
  const [behavior, setBehavior] = useState<'steer' | 'followUp'>('steer')
  const model = isObject(snapshot.state?.model) ? snapshot.state.model : null
  const currentModel = model && typeof model.id === 'string' && typeof model.provider === 'string' ? `${model.provider}/${model.id}` : ''
  const selectedModel = snapshot.models.find((item) => `${item.provider}/${item.id}` === currentModel)
  const modelInput = selectedModel?.input ?? model?.input
  const supportsImages = Array.isArray(modelInput) && modelInput.includes('image')
  const thinking = typeof snapshot.state?.thinkingLevel === 'string' ? snapshot.state.thinkingLevel : 'off'

  useEffect(() => {
    if (submitRequest > 0) formRef.current?.requestSubmit()
  }, [submitRequest])

  useEffect(() => {
    if (!requestedSelect) return
    setOpenSelect(requestedSelect)
    const trigger = requestedSelect === 'agent' ? agentTriggerRef.current : requestedSelect === 'model' ? modelTriggerRef.current : thinkingTriggerRef.current
    trigger?.focus()
    onSelectOpened?.()
  }, [onSelectOpened, requestedSelect])

  /** Commandes disponibles filtrées par le texte après le slash. */
  const filteredCommands = commands.filter((command) =>
    slashOpen && String(command.name).toLowerCase().includes(slashFilter.toLowerCase()),
  )

  /** Insère la commande slash sélectionnée dans le textarea et referme le popover. */
  function selectSlashCommand(name: string): void {
    setMessage(`/${name} `)
    setSlashOpen(false)
    setSlashIndex(-1)
  }

  /** Envoie texte et images dans la même commande RPC, puis restaure le brouillon en cas d'échec. */
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const nextMessage = message.trim()
    if (preparingImages || (!nextMessage && images.length === 0)) return
    if (images.length > 0 && !supportsImages) {
      onError("Le modèle sélectionné n'accepte pas les images.")
      return
    }
    setSubmitting(true)
    setMessage('')
    setImages([])
    try {
      await onSend(nextMessage, images.map(({ data, mimeType }) => ({ type: 'image', data, mimeType })), behavior)
    } catch (cause) {
      setMessage(nextMessage)
      setImages(images)
      onError(cause)
    } finally {
      setSubmitting(false)
    }
  }

  /** Prépare localement les images collées pour borner le corps HTTP et le contexte envoyé au modèle. */
  async function handlePaste(event: ReactClipboardEvent<HTMLTextAreaElement>): Promise<void> {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0 || submitting) return
    event.preventDefault()
    const pastedText = event.clipboardData.getData('text/plain')
    const { selectionEnd, selectionStart } = event.currentTarget
    if (pastedText) setMessage((current) => `${current.slice(0, selectionStart)}${pastedText}${current.slice(selectionEnd)}`)

    const remaining = maxComposerImages - images.length
    if (remaining <= 0) {
      onError(`Maximum de ${maxComposerImages} images par message.`)
      return
    }
    setPreparingImages(true)
    try {
      const prepared = await Promise.all(files.slice(0, remaining).map(prepareComposerImage))
      const accepted = prepared.filter((image): image is ComposerImage => image !== null)
      setImages((current) => [...current, ...accepted].slice(0, maxComposerImages))
      if (accepted.length !== files.length) onError(`Certaines images n'ont pas pu être préparées (maximum : ${maxComposerImages}).`)
    } catch (cause) {
      onError(cause)
    } finally {
      setPreparingImages(false)
    }
  }

  const stats = snapshot.stats
  const contextUsage = stats?.contextUsage
  const contextPercent = typeof contextUsage?.percent === 'number' ? `${Math.round(contextUsage.percent)}%` : '—'
  const contextTokens = typeof contextUsage?.tokens === 'number' && typeof contextUsage.contextWindow === 'number'
    ? `${formatTokens(contextUsage.tokens)} / ${formatTokens(contextUsage.contextWindow)}`
    : 'Indisponible'
  const cost = typeof stats?.cost === 'number' ? `$${stats.cost.toFixed(2)}` : '—'
  const contextClass = typeof contextUsage?.percent === 'number'
    ? contextUsage.percent >= 40 ? 'context-danger' : contextUsage.percent >= 30 ? 'context-warning-strong' : contextUsage.percent >= 20 ? 'context-warning' : ''
    : ''

  return (
    <form className="composer" onSubmit={(event) => void submit(event)} ref={formRef}>
      {images.length > 0 && <div aria-label="Images à envoyer" className="composer-images">
        {images.map((image, index) => <div className="composer-image" key={image.id}>
          <img alt={`Image ${index + 1} à envoyer`} src={`data:${image.mimeType};base64,${image.data}`} />
          <button aria-label={`Retirer l'image ${index + 1}`} disabled={submitting} onClick={() => setImages((current) => current.filter(({ id }) => id !== image.id))} type="button">×</button>
        </div>)}
      </div>}
      {slashOpen && filteredCommands.length > 0 && (
        <div className="slash-commands" role="listbox">
          {filteredCommands.map((command, index) => (
            <div
              aria-selected={index === slashIndex}
              className={`slash-command-item${index === slashIndex ? ' selected' : ''}`}
              key={String(command.name)}
              onClick={() => selectSlashCommand(String(command.name))}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
            >
              <span className="slash-command-name">/{String(command.name)}</span>
            </div>
          ))}
        </div>
      )}
      <textarea aria-label="Message" disabled={submitting} onPaste={(event) => void handlePaste(event)} value={message} onChange={(event) => {
        const next = event.target.value
        setMessage(next)
        if (next.startsWith('/') && commands.length > 0) {
          setSlashOpen(true)
          setSlashFilter(next.slice(1))
          setSlashIndex(-1)
        } else {
          setSlashOpen(false)
        }
      }} onKeyDown={(event) => {
        if (slashOpen && filteredCommands.length > 0) {
          if (event.key === 'Escape') { event.preventDefault(); setSlashOpen(false); return }
          if (event.key === 'ArrowDown') { event.preventDefault(); setSlashIndex((index) => Math.min(index + 1, filteredCommands.length - 1)); return }
          if (event.key === 'ArrowUp') { event.preventDefault(); setSlashIndex((index) => Math.max(index - 1, 0)); return }
          if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault()
            const target = slashIndex >= 0 ? filteredCommands[slashIndex] : filteredCommands[0]
            if (target) selectSlashCommand(String(target.name))
            return
          }
          return
        }
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
      }} placeholder="Demandez quelque chose à Pi…" rows={3} />
      <div className="composer-footer">
        <div className="composer-actions">
          <div className="composer-tools">
            {showAgentSelector && <ComposerSelect
              ariaLabel="Agent"
              disabled={agentLoading || agentBusy || agentOptions.length === 0}
              onValueChange={onAgentChange}
              onOpenChange={(open) => setOpenSelect(open ? 'agent' : null)}
              open={openSelect === 'agent'}
              options={agentOptions.map((agent) => ({ label: capitalizeLabel(agent), value: agent }))}
              placeholder={agentLoading || agentBusy ? 'Chargement…' : 'Choisir un agent'}
              tone="agent"
              triggerRef={agentTriggerRef}
              value={selectedAgent}
            />}
            <ComposerSelect
              ariaLabel="Modèle"
              onOpenChange={(open) => setOpenSelect(open ? 'model' : null)}
              open={openSelect === 'model'}
              onValueChange={(value) => {
                const selected = snapshot.models.find((item) => `${item.provider}/${item.id}` === value)
                if (selected) void onCommand({ type: 'set_model', provider: selected.provider, modelId: selected.id }).catch(onError)
              }}
              options={snapshot.models.map((item) => ({ label: String(item.name ?? item.id), value: `${item.provider}/${item.id}` }))}
              placeholder="Choisir un modèle"
              tone="model"
              triggerRef={modelTriggerRef}
              value={currentModel}
            />
            <ComposerSelect
              ariaLabel="Niveau de réflexion"
              onOpenChange={(open) => setOpenSelect(open ? 'thinking' : null)}
              open={openSelect === 'thinking'}
              onValueChange={(value) => void onCommand({ type: 'set_thinking_level', level: value }).catch(onError)}
              options={['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) => ({ label: capitalizeLabel(level), value: level }))}
              tone="thinking"
              triggerRef={thinkingTriggerRef}
              value={thinking}
            />

            {running && <ComposerSelect
              ariaLabel="Comportement du prochain message"
              onValueChange={(value) => setBehavior(value as 'steer' | 'followUp')}
              options={[{ label: 'Intervenir', value: 'steer' }, { label: 'À la suite', value: 'followUp' }]}
              tone="behavior"
              value={behavior}
            />}
            {running && <button aria-label="Arrêter la génération" className="icon-button danger" onClick={() => void onAbort().catch(onError)} title="Arrêter la génération" type="button">
              <svg aria-hidden="true" viewBox="0 0 16 16"><rect height="8" rx="1.5" width="8" x="4" y="4" /></svg>
            </button>}
          </div>
          <button aria-label="Envoyer le message" className="icon-button send" disabled={submitting || preparingImages} title="Envoyer le message (Entrée)" type="submit">
            <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m2.5 2.5 11 5.5-11 5.5 1.8-5.1L9 8 4.3 7.6z" /></svg>
          </button>
        </div>
        <div className="composer-info" aria-label="Informations de la session">
          <div className="composer-session">{session.status === 'running' && <span className="status-dot" aria-label="Agent en cours de travail" role="img" />}<strong>{session.name}</strong><span title={session.cwd}>{session.cwd}</span></div>
          <div className="composer-stats"><span><b>Coût</b>{cost}</span><span className={contextClass}><b>Contexte</b>{contextPercent}<small>{contextTokens}</small></span></div>
        </div>
      </div>
    </form>
  )
}

function ComposerSelect({ ariaLabel, disabled, onOpenChange, onValueChange, open, options, placeholder, tone, triggerRef, value }: {
  ariaLabel: string
  disabled?: boolean
  onValueChange: (value: string) => void
  options: { label: string; value: string }[]
  placeholder?: string
  tone: 'agent' | 'behavior' | 'command' | 'model' | 'thinking'
  value: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerRef?: RefObject<HTMLButtonElement | null>
}) {
  return (
    <Select.Root disabled={disabled} onOpenChange={onOpenChange} open={open} onValueChange={onValueChange} value={value}>
      <Select.Trigger aria-label={ariaLabel} className={`composer-select ${tone}`} ref={triggerRef}>
        <ComposerSelectIcon tone={tone} />
        <Select.Value placeholder={placeholder} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className={`composer-select-content ${tone}`} position="popper" sideOffset={7}>
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item className="composer-select-option" key={option.value} value={option.value}>
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator aria-hidden="true">✓</Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

/** Rend les valeurs techniques lisibles dans les libellés du composer sans modifier les valeurs RPC. */
function capitalizeLabel(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value
}

/** Utilise des pictogrammes SVG cohérents et indépendants d'une police ou d'un jeu d'emoji. */
function ComposerSelectIcon({ tone }: { tone: 'agent' | 'behavior' | 'command' | 'model' | 'thinking' }) {
  if (tone === 'model') return <svg aria-hidden="true" className="composer-select-icon" viewBox="0 0 16 16"><path d="m2.5 5 5.5-2.5L13.5 5 8 7.5 2.5 5Zm0 3L8 10.5 13.5 8M2.5 11 8 13.5l5.5-2.5" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" /></svg>
  if (tone === 'thinking') return <svg aria-hidden="true" className="composer-select-icon" viewBox="0 0 16 16"><path d="m8 2 1.4 4.6L14 8l-4.6 1.4L8 14 6.6 9.4 2 8l4.6-1.4L8 2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" /></svg>
  return <span className="composer-select-icon" aria-hidden="true" />
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatTokens(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
}
