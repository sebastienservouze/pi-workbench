import * as Select from '@radix-ui/react-select'
import { memo, useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type FormEvent, type RefObject } from 'react'
import type { JsonObject, SessionSnapshot, SessionSummary } from '../../../shared/types.ts'
import { maxComposerImages, prepareComposerImage, type ComposerImage } from './composer-images.ts'

/** Provides user input and session commands while reflecting the current Pi state. */
export const Composer = memo(function Composer({ session, snapshot, agentBusy, agentOptions, selectedAgent, agentLoading, showAgentSelector, onAgentChange, onCommand, commands, running, onSend, onAbort, onError, requestedSelect, onSelectOpened, submitRequest = 0, focusRequest, draftRequest, onDraftApplied }: {
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
  focusRequest?: number
  draftRequest?: { id: string; message: string }
  onDraftApplied?: (id: string) => void
}) {
  const draftStorageKey = `pi-workbench.composer-draft.${session.id}`
  const [message, setMessage] = useState(() => readComposerDraft(draftStorageKey))
  const [images, setImages] = useState<ComposerImage[]>([])
  const [preparingImages, setPreparingImages] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [openSelect, setOpenSelect] = useState<'agent' | 'model' | 'thinking' | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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

  // oxlint-disable react-hooks/exhaustive-deps
  useEffect(() => {
    if ((focusRequest ?? 0) > 0) textareaRef.current?.focus()
  }, [focusRequest])

  useEffect(() => {
    if (!requestedSelect) return
    setOpenSelect(requestedSelect)
    const trigger = requestedSelect === 'agent' ? agentTriggerRef.current : requestedSelect === 'model' ? modelTriggerRef.current : thinkingTriggerRef.current
    trigger?.focus()
    onSelectOpened?.()
  }, [onSelectOpened, requestedSelect])

  useEffect(() => {
    if (!draftRequest) return
    setDraftMessage(draftRequest.message)
    textareaRef.current?.focus()
    onDraftApplied?.(draftRequest.id)
  }, [draftRequest, onDraftApplied])

  /** Available commands filtered by the text after the slash. */
  const filteredCommands = commands.filter((command) =>
    slashOpen && String(command.name).toLowerCase().includes(slashFilter.toLowerCase()),
  )

  /** Inserts the selected slash command into the textarea and closes the popover. */
  function selectSlashCommand(name: string): void {
    setDraftMessage(`/${name} `)
    setSlashOpen(false)
    setSlashIndex(-1)
  }

  /** Updates the visible draft and persists it so a page reload cannot discard typed text. */
  function setDraftMessage(nextMessage: string): void {
    setMessage(nextMessage)
    try {
      if (nextMessage) window.localStorage.setItem(draftStorageKey, nextMessage)
      else window.localStorage.removeItem(draftStorageKey)
    } catch {
      // Storage can be unavailable in private browsing; the in-memory draft still works.
    }
  }

  /** Sends text and images in the same RPC command, restoring the draft on failure. */
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const nextMessage = message.trim()
    if (preparingImages || (!nextMessage && images.length === 0)) return
    if (images.length > 0 && !supportsImages) {
      onError('The selected model does not accept images.')
      return
    }
    setSubmitting(true)
    setDraftMessage('')
    setImages([])
    try {
      await onSend(nextMessage, images.map(({ data, mimeType }) => ({ type: 'image', data, mimeType })), behavior)
    } catch (cause) {
      setDraftMessage(nextMessage)
      setImages(images)
      onError(cause)
    } finally {
      setSubmitting(false)
    }
  }

  /** Prepares pasted images locally to bound the HTTP body and context sent to the model. */
  async function handlePaste(event: ReactClipboardEvent<HTMLTextAreaElement>): Promise<void> {
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0 || submitting) return
    event.preventDefault()
    const pastedText = event.clipboardData.getData('text/plain')
    const { selectionEnd, selectionStart } = event.currentTarget
    if (pastedText) setDraftMessage(`${message.slice(0, selectionStart)}${pastedText}${message.slice(selectionEnd)}`)

    const remaining = maxComposerImages - images.length
    if (remaining <= 0) {
      onError(`A message can contain at most ${maxComposerImages} images.`)
      return
    }
    setPreparingImages(true)
    try {
      const prepared = await Promise.all(files.slice(0, remaining).map(prepareComposerImage))
      const accepted = prepared.filter((image): image is ComposerImage => image !== null)
      setImages((current) => [...current, ...accepted].slice(0, maxComposerImages))
      if (accepted.length !== files.length) onError(`Some images could not be prepared (maximum: ${maxComposerImages}).`)
    } catch (cause) {
      onError(cause)
    } finally {
      setPreparingImages(false)
    }
  }

  const stats = snapshot.stats
  const contextUsage = stats?.contextUsage
  const contextPercentValue = typeof contextUsage?.percent === 'number' ? Math.round(contextUsage.percent) : null
  const contextPercent = contextPercentValue === null ? '—' : `${contextPercentValue}%`
  const contextTokens = typeof contextUsage?.tokens === 'number' && typeof contextUsage.contextWindow === 'number'
    ? `${formatTokens(contextUsage.tokens)} / ${formatTokens(contextUsage.contextWindow)}`
    : 'Unavailable'
  const cost = typeof stats?.cost === 'number' ? `$${stats.cost.toFixed(2)}` : '—'
  const contextClass = typeof contextUsage?.percent === 'number'
    ? contextUsage.percent >= 40 ? 'context-danger' : contextUsage.percent >= 30 ? 'context-warning-strong' : contextUsage.percent >= 20 ? 'context-warning' : ''
    : ''

  return (
    <form className="composer" onSubmit={(event) => void submit(event)} ref={formRef}>
      {images.length > 0 && <div aria-label="Images to send" className="composer-images">
        {images.map((image, index) => <div className="composer-image" key={image.id}>
          <img alt={`Image ${index + 1} to send`} src={`data:${image.mimeType};base64,${image.data}`} />
          <button aria-label={`Remove image ${index + 1}`} disabled={submitting} onClick={() => setImages((current) => current.filter(({ id }) => id !== image.id))} type="button">×</button>
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
      <textarea aria-label="Message" disabled={submitting} onPaste={(event) => void handlePaste(event)} ref={textareaRef} value={message} onChange={(event) => {
        const next = event.target.value
        setDraftMessage(next)
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
      }} placeholder="Ask Pi…  / for commands" rows={3} />
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
              placeholder={agentLoading || agentBusy ? 'Loading…' : 'Choose an agent'}
              tone="agent"
              triggerRef={agentTriggerRef}
              value={selectedAgent}
            />}
            <ComposerSelect
              ariaLabel="Model"
              onOpenChange={(open) => setOpenSelect(open ? 'model' : null)}
              open={openSelect === 'model'}
              onValueChange={(value) => {
                const selected = snapshot.models.find((item) => `${item.provider}/${item.id}` === value)
                if (selected) void onCommand({ type: 'set_model', provider: selected.provider, modelId: selected.id }).catch(onError)
              }}
              options={snapshot.models.map((item) => ({ label: String(item.name ?? item.id), value: `${item.provider}/${item.id}` }))}
              placeholder="Choose a model"
              tone="model"
              triggerRef={modelTriggerRef}
              value={currentModel}
            />
            <ComposerSelect
              ariaLabel="Thinking level"
              onOpenChange={(open) => setOpenSelect(open ? 'thinking' : null)}
              open={openSelect === 'thinking'}
              onValueChange={(value) => void onCommand({ type: 'set_thinking_level', level: value }).catch(onError)}
              options={['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) => ({ label: capitalizeLabel(level), value: level }))}
              tone="thinking"
              triggerRef={thinkingTriggerRef}
              value={thinking}
            />

            {running && <ComposerSelect
              ariaLabel="Next message behavior"
              onValueChange={(value) => setBehavior(value as 'steer' | 'followUp')}
              options={[{ label: 'Steer', value: 'steer' }, { label: 'Follow up', value: 'followUp' }]}
              tone="behavior"
              value={behavior}
            />}
          </div>
          <div className="composer-primary-actions">
            <span className="composer-stop-slot">{running && <button aria-label="Stop generation" className="icon-button danger" onClick={() => void onAbort().catch(onError)} title="Stop generation" type="button">
              <svg aria-hidden="true" viewBox="0 0 16 16"><rect height="8" rx="1.5" width="8" x="4" y="4" /></svg>
            </button>}</span>
            <button aria-label="Send message" className="icon-button send" disabled={submitting || preparingImages || (!message.trim() && images.length === 0)} title="Send message (Enter)" type="submit">
              <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m2.5 2.5 11 5.5-11 5.5 1.8-5.1L9 8 4.3 7.6z" /></svg>
            </button>
          </div>
        </div>
        <div className="composer-info" aria-label="Session information">
          <div className="composer-session">{running && <span aria-label="Pi is active" className="status-dot" role="img" />}<strong>{session.name}</strong><span title={session.cwd}>{session.cwd}</span></div>
          <div className="composer-stats"><span><b>Cost</b>{cost}</span><span className={contextClass} title={contextTokens}><b>Context</b>{contextPercent}{contextPercentValue !== null && <progress aria-label={`Context usage: ${contextPercent}`} max={100} value={contextPercentValue} />}</span></div>
        </div>
      </div>
    </form>
  )
})

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

/** Makes technical values readable in composer labels without changing RPC values. */
function capitalizeLabel(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value
}

/** Uses consistent SVG pictograms independent of a font or emoji set. */
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

/** Restores the draft for one session without making storage availability a prerequisite. */
function readComposerDraft(storageKey: string): string {
  try {
    return window.localStorage.getItem(storageKey) ?? ''
  } catch {
    return ''
  }
}
