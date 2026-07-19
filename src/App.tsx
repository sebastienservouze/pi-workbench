import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'
import { createSession, getSnapshot, listSessions, sendPiCommand } from './api.ts'
import type { JsonObject, ManagerEvent, SessionSnapshot, SessionSummary } from '../shared/types.ts'

interface UiDialog {
  sessionId: string
  request: JsonObject
}

interface AgentIntent {
  value?: string
}

const emptySnapshot: SessionSnapshot = { state: null, messages: [], models: [], commands: [] }

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(emptySnapshot)
  const [snapshotSessionId, setSnapshotSessionId] = useState('')
  const [liveText, setLiveText] = useState('')
  const [activeTools, setActiveTools] = useState<Record<string, string>>({})
  const [agentOptions, setAgentOptions] = useState<Record<string, string[]>>({})
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string>>({})
  const [agentBusy, setAgentBusy] = useState<Record<string, boolean>>({})
  const [dialog, setDialog] = useState<UiDialog | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const selectedIdRef = useRef(selectedId)
  const agentIntentsRef = useRef(new Map<string, AgentIntent>())
  selectedIdRef.current = selectedId

  const refreshSessions = useCallback(async () => {
    try {
      const nextSessions = await listSessions()
      setSessions(nextSessions)
      setSelectedId((current) => current || nextSessions[0]?.id || '')
      const pending = nextSessions.flatMap((session) =>
        session.pendingUi.map((request) => ({ sessionId: session.id, request })),
      )[0]
      if (pending) setDialog(pending)
      setError('')
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [])

  const refreshSnapshot = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setSnapshot(emptySnapshot)
      setSnapshotSessionId('')
      return
    }
    try {
      setSnapshot(await getSnapshot(sessionId))
      setSnapshotSessionId(sessionId)
      setError('')
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [])

  const requestAgent = useCallback((sessionId: string, value?: string) => {
    if (agentIntentsRef.current.has(sessionId)) return
    agentIntentsRef.current.set(sessionId, value ? { value } : {})
    setAgentBusy((current) => ({ ...current, [sessionId]: true }))
    void sendPiCommand(sessionId, { type: 'prompt', message: '/agent' })
      .catch((cause) => {
        agentIntentsRef.current.delete(sessionId)
        setError(messageOf(cause))
      })
      .finally(() => setAgentBusy((current) => ({ ...current, [sessionId]: false })))
  }, [])

  useEffect(() => void refreshSessions(), [refreshSessions])
  useEffect(() => {
    setSnapshot(emptySnapshot)
    setSnapshotSessionId('')
    setLiveText('')
    setActiveTools({})
    void refreshSnapshot(selectedId)
  }, [refreshSnapshot, selectedId])

  useEffect(() => {
    const events = new EventSource('/api/events')
    events.onmessage = ({ data }) => {
      const event: unknown = JSON.parse(data)
      if (!isManagerEvent(event)) return
      if (event.event === 'manager_connected' || event.event === 'session_created' || event.event === 'session_exited') {
        void refreshSessions()
      }
      if (event.event !== 'pi' || !isObject(event.data)) return
      handlePiEvent(event.sessionId, event.data)
    }
    events.onerror = () => setError('Connexion au backend interrompue; nouvelle tentative en cours.')
    return () => events.close()

    function handlePiEvent(sessionId: string, event: JsonObject): void {
      if (event.type === 'agent_start') updateSessionStatus(sessionId, 'running')
      if (event.type === 'agent_settled') updateSessionStatus(sessionId, 'idle')

      if (event.type === 'extension_ui_request') {
        if (event.method === 'notify' && typeof event.message === 'string') setNotice(event.message)
        const agentIntent = agentIntentsRef.current.get(sessionId)
        if (agentIntent && isAgentSelector(event)) {
          const options = event.options.filter((option): option is string => typeof option === 'string')
          setAgentOptions((current) => ({ ...current, [sessionId]: options }))
          agentIntentsRef.current.delete(sessionId)

          const selectedAgent = agentIntent.value && options.includes(agentIntent.value) ? agentIntent.value : undefined
          const response = selectedAgent ? { value: selectedAgent } : { cancelled: true }
          void sendPiCommand(sessionId, { type: 'extension_ui_response', id: event.id, ...response })
            .then(() => {
              if (selectedAgent) setSelectedAgents((current) => ({ ...current, [sessionId]: selectedAgent }))
            })
            .catch((cause) => setError(messageOf(cause)))
          if (agentIntent.value && !selectedAgent) setError('L’agent sélectionné n’est plus disponible.')
          return
        }
        if (isBlockingDialog(event)) setDialog({ sessionId, request: event })
      }

      if (sessionId !== selectedIdRef.current) return
      if (event.type === 'message_start') setLiveText('')
      if (event.type === 'message_update' && isObject(event.assistantMessageEvent)) {
        const update = event.assistantMessageEvent
        if (update.type === 'text_delta' && typeof update.delta === 'string') {
          setLiveText((current) => current + update.delta)
        }
      }
      if (event.type === 'tool_execution_start' && typeof event.toolCallId === 'string') {
        setActiveTools((current) => ({ ...current, [event.toolCallId as string]: String(event.toolName ?? 'tool') }))
      }
      if (event.type === 'tool_execution_end' && typeof event.toolCallId === 'string') {
        setActiveTools((current) => {
          const next = { ...current }
          delete next[event.toolCallId as string]
          return next
        })
      }
      if (event.type === 'message_end' || event.type === 'agent_settled') {
        setLiveText('')
        void refreshSnapshot(sessionId)
      }
    }
  }, [refreshSessions, refreshSnapshot])

  useEffect(() => {
    const exposesAgentCommand = snapshot.commands.some((command) => command.name === 'agent')
    if (snapshotSessionId === selectedId && exposesAgentCommand && !agentOptions[selectedId] && !agentBusy[selectedId]) {
      requestAgent(selectedId)
    }
  }, [agentBusy, agentOptions, requestAgent, selectedId, snapshot.commands, snapshotSessionId])

  function updateSessionStatus(sessionId: string, status: SessionSummary['status']): void {
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, status } : session)))
  }

  const selectedSession = sessions.find((session) => session.id === selectedId)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">π</span>
          <div><strong>Pi Workbench</strong><small>Local workspace</small></div>
        </div>
        <NewSessionButton
          onCreate={async () => {
            const session = await createSession()
            await refreshSessions()
            setSelectedId(session.id)
          }}
          onError={(cause) => setError(messageOf(cause))}
        />
        <nav className="session-list" aria-label="Sessions Pi">
          {sessions.map((session) => (
            <button
              className={session.id === selectedId ? 'session-item selected' : 'session-item'}
              key={session.id}
              onClick={() => setSelectedId(session.id)}
              type="button"
            >
              <span className={`status-dot ${session.status}`} />
              <span><strong>{session.name}</strong><small>{session.cwd}</small></span>
            </button>
          ))}
          {sessions.length === 0 && <p className="empty-sidebar">Créez votre première session.</p>}
        </nav>
      </aside>

      <main className="workspace">
        {selectedSession ? (
          <>
            <SessionHeader
              session={selectedSession}
              snapshot={snapshot}
              agentBusy={Boolean(agentBusy[selectedSession.id])}
              agentOptions={agentOptions[selectedSession.id] ?? []}
              selectedAgent={selectedAgents[selectedSession.id] ?? ''}
              onAgentChange={(agent) => requestAgent(selectedSession.id, agent)}
              onCommand={async (command) => {
                const result = await sendPiCommand(selectedSession.id, command)
                await refreshSnapshot(selectedSession.id)
                return result
              }}
              onError={(cause) => setError(messageOf(cause))}
            />
            <Conversation messages={snapshot.messages} liveText={liveText} activeTools={activeTools} />
            <Composer
              commands={snapshot.commands}
              running={selectedSession.status === 'running'}
              onSend={async (message, behavior) => {
                const command: JsonObject = { type: 'prompt', message }
                if (selectedSession.status === 'running') command.streamingBehavior = behavior
                await sendPiCommand(selectedSession.id, command)
              }}
              onAbort={() => sendPiCommand(selectedSession.id, { type: 'abort' })}
              onError={(cause) => setError(messageOf(cause))}
            />
          </>
        ) : (
          <section className="welcome">
            <span className="brand-mark large">π</span>
            <h1>Pilotez Pi depuis votre navigateur</h1>
            <p>Créez une session locale pour retrouver vos modèles, agents, outils et commandes.</p>
          </section>
        )}
      </main>

      {(error || notice) && (
        <button className={error ? 'toast error' : 'toast'} onClick={() => { setError(''); setNotice('') }} type="button">
          {error || notice}
        </button>
      )}
      {dialog && <ExtensionDialog dialog={dialog} onClose={() => { setDialog(null); void refreshSessions() }} onError={(cause) => setError(messageOf(cause))} />}
    </div>
  )
}

function NewSessionButton({ onCreate, onError }: { onCreate: () => Promise<void>; onError: (cause: unknown) => void }) {
  const [busy, setBusy] = useState(false)

  async function create(): Promise<void> {
    setBusy(true)
    try {
      await onCreate()
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  return <button className="new-session" disabled={busy} onClick={() => void create()} type="button">{busy ? 'Démarrage…' : '＋ Nouvelle session'}</button>
}

function SessionHeader({ session, snapshot, agentBusy, agentOptions, selectedAgent, onAgentChange, onCommand, onError }: {
  session: SessionSummary
  snapshot: SessionSnapshot
  agentBusy: boolean
  agentOptions: string[]
  selectedAgent: string
  onAgentChange: (agent: string) => void
  onCommand: (command: JsonObject) => Promise<JsonObject>
  onError: (cause: unknown) => void
}) {
  const model = isObject(snapshot.state?.model) ? snapshot.state.model : null
  const currentModel = model && typeof model.id === 'string' && typeof model.provider === 'string' ? `${model.provider}/${model.id}` : ''
  const thinking = typeof snapshot.state?.thinkingLevel === 'string' ? snapshot.state.thinkingLevel : 'off'

  return (
    <header className="session-header">
      <div><h1>{session.name}</h1><p>{session.cwd}</p></div>
      <div className="controls">
        <label>Modèle<select value={currentModel} onChange={(event) => {
          const selected = snapshot.models.find((item) => `${item.provider}/${item.id}` === event.target.value)
          if (selected) void onCommand({ type: 'set_model', provider: selected.provider, modelId: selected.id }).catch(onError)
        }}>
          {snapshot.models.map((item) => <option key={`${item.provider}/${item.id}`} value={`${item.provider}/${item.id}`}>{String(item.name ?? item.id)}</option>)}
        </select></label>
        <label>Thinking<select value={thinking} onChange={(event) => void onCommand({ type: 'set_thinking_level', level: event.target.value }).catch(onError)}>
          {['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) => <option key={level}>{level}</option>)}
        </select></label>
        <label>Agent<select disabled={agentBusy || agentOptions.length === 0} value={selectedAgent} onChange={(event) => onAgentChange(event.target.value)}>
          <option value="">{agentBusy ? 'Chargement…' : 'Choisir un agent'}</option>
          {agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
        </select></label>
      </div>
    </header>
  )
}

function Conversation({ messages, liveText, activeTools }: { messages: JsonObject[]; liveText: string; activeTools: Record<string, string> }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, liveText, activeTools])
  return (
    <section className="conversation" aria-live="polite">
      {messages.map((message, index) => <MessageCard key={`${String(message.timestamp ?? '')}-${index}`} message={message} />)}
      {liveText && <article className="message assistant streaming"><RoleLabel role="assistant" /><div className="content"><Markdown>{liveText}</Markdown></div></article>}
      {Object.entries(activeTools).map(([id, tool]) => <div className="tool-running" key={id}><span className="spinner" />{tool} en cours…</div>)}
      {messages.length === 0 && !liveText && <div className="empty-conversation"><h2>Session prête</h2><p>Envoyez un message ou utilisez une commande de votre installation Pi.</p></div>}
      <div ref={endRef} />
    </section>
  )
}

function MessageCard({ message }: { message: JsonObject }) {
  const role = typeof message.role === 'string' ? message.role : 'event'
  return <article className={`message ${role}`}><RoleLabel role={role} /><div className="content">{renderContent(message.content ?? message.output)}</div></article>
}

function RoleLabel({ role }: { role: string }) {
  const labels: Record<string, string> = { user: 'Vous', assistant: 'Pi', toolResult: 'Outil', bashExecution: 'Shell' }
  return <div className="role">{labels[role] ?? role}</div>
}

function renderContent(content: unknown): ReactNode {
  if (typeof content === 'string') return <Markdown>{content}</Markdown>
  if (!Array.isArray(content)) return <pre>{formatUnknown(content)}</pre>
  return content.map((part, index) => {
    if (!isObject(part)) return <pre key={index}>{formatUnknown(part)}</pre>
    if (part.type === 'text' && typeof part.text === 'string') return <Markdown key={index}>{part.text}</Markdown>
    if (part.type === 'thinking' && typeof part.thinking === 'string') return <details key={index}><summary>Raisonnement</summary><Markdown>{part.thinking}</Markdown></details>
    if (part.type === 'toolCall') return <div className="tool-call" key={index}><strong>{String(part.name ?? 'tool')}</strong><pre>{formatUnknown(part.arguments)}</pre></div>
    return <pre key={index}>{formatUnknown(part)}</pre>
  })
}

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown>{children}</ReactMarkdown>
}

function Composer({ commands, running, onSend, onAbort, onError }: {
  commands: JsonObject[]
  running: boolean
  onSend: (message: string, behavior: 'steer' | 'followUp') => Promise<void>
  onAbort: () => Promise<JsonObject>
  onError: (cause: unknown) => void
}) {
  const [message, setMessage] = useState('')
  const [behavior, setBehavior] = useState<'steer' | 'followUp'>('steer')

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const nextMessage = message.trim()
    if (!nextMessage) return
    setMessage('')
    try { await onSend(nextMessage, behavior) } catch (cause) { setMessage(nextMessage); onError(cause) }
  }

  return (
    <form className="composer" onSubmit={(event) => void submit(event)}>
      <textarea aria-label="Message" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
      }} placeholder="Demandez quelque chose à Pi…" rows={3} />
      <div className="composer-actions">
        {commands.length > 0 && <select aria-label="Insérer une commande Pi" value="" onChange={(event) => setMessage(`/${event.target.value} `)}><option value="">Commandes</option>{commands.map((command) => <option key={String(command.name)} value={String(command.name)}>{String(command.name)}</option>)}</select>}
        {running && <select aria-label="Comportement du prochain message" value={behavior} onChange={(event) => setBehavior(event.target.value as 'steer' | 'followUp')}><option value="steer">Intervenir</option><option value="followUp">À la suite</option></select>}
        {running && <button className="danger" onClick={() => void onAbort().catch(onError)} type="button">Arrêter</button>}
        <button type="submit">Envoyer <span>↵</span></button>
      </div>
    </form>
  )
}

function ExtensionDialog({ dialog, onClose, onError }: { dialog: UiDialog; onClose: () => void; onError: (cause: unknown) => void }) {
  const request = dialog.request
  const [value, setValue] = useState(typeof request.prefill === 'string' ? request.prefill : '')

  async function respond(fields: JsonObject): Promise<void> {
    try {
      await sendPiCommand(dialog.sessionId, { type: 'extension_ui_response', id: request.id, ...fields })
      onClose()
    } catch (cause) { onError(cause) }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-modal="true" className="modal" role="dialog">
        <h2>{String(request.title ?? 'Pi demande votre attention')}</h2>
        {typeof request.message === 'string' && <p>{request.message}</p>}
        {request.method === 'select' && Array.isArray(request.options) && <div className="option-list">{request.options.map((option) => <button key={String(option)} onClick={() => void respond({ value: option })} type="button">{String(option)}</button>)}</div>}
        {(request.method === 'input' || request.method === 'editor') && <textarea autoFocus value={value} onChange={(event) => setValue(event.target.value)} rows={request.method === 'editor' ? 8 : 2} />}
        <div className="modal-actions">
          {request.method === 'confirm' && <><button onClick={() => void respond({ confirmed: true })} type="button">Confirmer</button><button onClick={() => void respond({ confirmed: false })} type="button">Refuser</button></>}
          {(request.method === 'input' || request.method === 'editor') && <button onClick={() => void respond({ value })} type="button">Valider</button>}
          <button onClick={() => void respond({ cancelled: true })} type="button">Annuler</button>
        </div>
      </section>
    </div>
  )
}

function isManagerEvent(value: unknown): value is ManagerEvent {
  return isObject(value) && value.kind === 'event' && typeof value.event === 'string' && typeof value.sessionId === 'string'
}

function isAgentSelector(value: JsonObject): value is JsonObject & { id: string; options: unknown[] } {
  return value.method === 'select'
    && value.title === 'Select an agent'
    && typeof value.id === 'string'
    && Array.isArray(value.options)
}

function isBlockingDialog(value: JsonObject): boolean {
  return value.method === 'select' || value.method === 'confirm' || value.method === 'input' || value.method === 'editor'
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatUnknown(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export default App
