import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import * as Select from '@radix-ui/react-select'
import ReactMarkdown from 'react-markdown'
import './App.css'
import { createSession, getSnapshot, listDirectories, listRecentSessions, listSessions, openSession, sendPiCommand } from './api.ts'
import type { DirectoryListing, JsonObject, ManagerEvent, RecentSession, SessionSnapshot, SessionSummary } from '../shared/types.ts'
import { askUserQuestionProtocol, parseAskUserQuestionRequest, type AskUserQuestionRequest } from '../shared/ask-user-question.ts'
import { activityForPiEvent, activityText, waitingActivity, type Activity } from './activity.ts'

interface UiDialog {
  sessionId: string
  request: JsonObject
}

interface AgentIntent {
  value?: string
}

interface Toast {
  id: number
  kind: 'notice' | 'error'
  message: string
}

const emptySnapshot: SessionSnapshot = { state: null, messages: [], models: [], commands: [], stats: null }

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [workspacePath, setWorkspacePath] = useState(() => window.localStorage.getItem('pi-workbench.workspace-path') ?? '~/.pi')
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false)
  const [openingSessionPath, setOpeningSessionPath] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(emptySnapshot)
  const [snapshotSessionId, setSnapshotSessionId] = useState('')
  const [liveText, setLiveText] = useState('')
  const [activity, setActivity] = useState<Activity | null>(null)
  const [agentOptions, setAgentOptions] = useState<Record<string, string[]>>({})
  const [agentBusy, setAgentBusy] = useState<Record<string, boolean>>({})
  const [dialog, setDialog] = useState<UiDialog | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const selectedIdRef = useRef(selectedId)
  const refreshVersionRef = useRef(0)
  const toastIdRef = useRef(0)
  const agentIntentsRef = useRef(new Map<string, AgentIntent>())
  selectedIdRef.current = selectedId

  const showToast = useCallback((kind: Toast['kind'], message: string) => {
    setToast({ id: ++toastIdRef.current, kind, message })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => {
      setToast((current) => current?.id === toast.id ? null : current)
    }, toast.kind === 'error' ? 6000 : 4000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const refreshSessions = useCallback(async (cwd = workspacePath) => {
    const version = ++refreshVersionRef.current
    try {
      const [nextSessions, nextRecentSessions] = await Promise.all([listSessions(), listRecentSessions(cwd)])
      if (version !== refreshVersionRef.current) return
      setSessions(nextSessions)
      setRecentSessions(nextRecentSessions)
      setSelectedId((current) => nextSessions.some((session) => session.id === current) ? current : '')
      const pending = nextSessions.flatMap((session) =>
        session.pendingUi.map((request) => ({ sessionId: session.id, request })),
      )[0]
      if (pending) setDialog(pending)
    } catch (cause) {
      if (version === refreshVersionRef.current) showToast('error', messageOf(cause))
    }
  }, [showToast, workspacePath])

  const refreshSnapshot = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setSnapshot(emptySnapshot)
      setSnapshotSessionId('')
      return
    }
    try {
      setSnapshot(await getSnapshot(sessionId))
      setSnapshotSessionId(sessionId)
    } catch (cause) {
      showToast('error', messageOf(cause))
    }
  }, [showToast])

  const requestAgent = useCallback((sessionId: string, value?: string) => {
    if (agentIntentsRef.current.has(sessionId)) return
    agentIntentsRef.current.set(sessionId, value ? { value } : {})
    setAgentBusy((current) => ({ ...current, [sessionId]: true }))
    void sendPiCommand(sessionId, { type: 'prompt', message: '/agent' })
      .then(() => refreshSnapshot(sessionId))
      .catch((cause) => {
        agentIntentsRef.current.delete(sessionId)
        showToast('error', messageOf(cause))
      })
      .finally(() => setAgentBusy((current) => ({ ...current, [sessionId]: false })))
  }, [refreshSnapshot, showToast])

  useEffect(() => void refreshSessions(), [refreshSessions])
  useEffect(() => {
    setSnapshot(emptySnapshot)
    setSnapshotSessionId('')
    setLiveText('')
    setActivity(null)
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
    events.onerror = () => showToast('error', 'Connexion au backend interrompue; nouvelle tentative en cours.')
    return () => events.close()

    function handlePiEvent(sessionId: string, event: JsonObject): void {
      if (event.type === 'session_info_changed') {
        const name = typeof event.name === 'string' && event.name.trim() ? event.name.trim() : 'Nouvelle session'
        setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, name } : session))
        void refreshSessions()
      }
      if (event.type === 'agent_start') updateSessionStatus(sessionId, 'running')
      if (event.type === 'agent_settled') updateSessionStatus(sessionId, 'idle')
      if (event.type === 'extension_ui_request' && event.method === 'setStatus' && event.statusKey === 'agent') {
        updateSessionAgent(sessionId, typeof event.activeAgent === 'string' ? event.activeAgent : undefined)
      }

      if (sessionId === selectedIdRef.current && event.type === 'extension_ui_request' && isBlockingDialog(event) && !isAgentSelector(event)) {
        setActivity(waitingActivity())
      }

      if (event.type === 'extension_ui_request') {
        if (event.method === 'notify' && typeof event.message === 'string') showToast('notice', event.message)
        const agentIntent = agentIntentsRef.current.get(sessionId)
        if (agentIntent && isAgentSelector(event)) {
          const options = event.options.filter((option): option is string => typeof option === 'string')
          setAgentOptions((current) => ({ ...current, [sessionId]: options }))
          agentIntentsRef.current.delete(sessionId)

          const selectedAgent = agentIntent.value && options.includes(agentIntent.value) ? agentIntent.value : undefined
          const response = selectedAgent ? { value: selectedAgent } : { cancelled: true }
          void sendPiCommand(sessionId, { type: 'extension_ui_response', id: event.id, ...response })
            .then(() => refreshSnapshot(sessionId))
            .catch((cause) => showToast('error', messageOf(cause)))
          if (agentIntent.value && !selectedAgent) showToast('error', 'L’agent sélectionné n’est plus disponible.')
          return
        }
        if (isBlockingDialog(event)) setDialog({ sessionId, request: event })
      }

      if (sessionId !== selectedIdRef.current) return
      setActivity((current) => activityForPiEvent(current, event))
      if (event.type === 'message_start') setLiveText('')
      if (event.type === 'message_update' && isObject(event.assistantMessageEvent)) {
        const update = event.assistantMessageEvent
        if (update.type === 'text_delta' && typeof update.delta === 'string') setLiveText((current) => current + update.delta)
      }
      if (event.type === 'message_end' || event.type === 'agent_settled') {
        setLiveText('')
        void refreshSnapshot(sessionId)
      }
    }
  }, [refreshSessions, refreshSnapshot, showToast])

  useEffect(() => {
    const exposesAgentCommand = snapshot.commands.some((command) => command.name === 'agent')
    if (snapshotSessionId === selectedId && exposesAgentCommand && !agentOptions[selectedId] && !agentBusy[selectedId]) {
      requestAgent(selectedId)
    }
  }, [agentBusy, agentOptions, requestAgent, selectedId, snapshot.commands, snapshotSessionId])

  function updateSessionStatus(sessionId: string, status: SessionSummary['status']): void {
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, status } : session)))
  }

  function updateSessionAgent(sessionId: string, activeAgent: string | undefined): void {
    setSessions((current) => current.map((session) => (session.id === sessionId ? { ...session, activeAgent } : session)))
  }

  const selectedSession = sessions.find((session) => session.id === selectedId)
  const questionnaire = dialog && dialog.sessionId === selectedId && isAskUserQuestionDialog(dialog.request) ? dialog : null

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">π</span>
          <div><strong>Pi Workbench</strong><small>Local workspace</small></div>
        </div>
        <button className="workspace-path" onClick={() => setDirectoryPickerOpen(true)} title={workspacePath} type="button">
          <span>Dossier courant</span><strong>{workspacePath}</strong>
        </button>
        <NewSessionButton
          onCreate={async () => {
            const session = await createSession(workspacePath)
            await refreshSessions()
            setSelectedId(session.id)
          }}
          onError={(cause) => showToast('error', messageOf(cause))}
        />
        <nav className="session-list" aria-label="Sessions Pi récentes">
          {recentSessions.map((recentSession) => {
            const activeSession = sessions.find((session) => session.sessionPath === recentSession.sessionPath && session.status !== 'exited')
            return (
              <button
                className={activeSession?.id === selectedId ? 'session-item selected' : 'session-item'}
                disabled={openingSessionPath === recentSession.sessionPath}
                key={recentSession.sessionPath}
                onClick={() => {
                  if (activeSession) {
                    setSelectedId(activeSession.id)
                    return
                  }
                  setOpeningSessionPath(recentSession.sessionPath)
                  void openSession(workspacePath, recentSession.sessionPath)
                    .then(async (session) => {
                      await refreshSessions()
                      setSelectedId(session.id)
                    })
                    .catch((cause) => showToast('error', messageOf(cause)))
                    .finally(() => setOpeningSessionPath(''))
                }}
                type="button"
              >
                <span className={`status-dot ${activeSession?.status ?? 'exited'}`} />
                <span><strong>{openingSessionPath === recentSession.sessionPath ? 'Ouverture…' : recentSession.name}</strong><small>{new Date(recentSession.updatedAt).toLocaleString('fr-FR')}</small></span>
              </button>
            )
          })}
          {recentSessions.length === 0 && <p className="empty-sidebar">Aucune session Pi dans ce dossier.</p>}
        </nav>
      </aside>

      <main className="workspace">
        {selectedSession ? (
          <>
            <Conversation messages={snapshot.messages} liveText={liveText} activity={activity} agentName={selectedSession.activeAgent} />
            {questionnaire && <AskUserQuestionDialog key={String(questionnaire.request.id)} dialog={questionnaire} onClose={() => { setDialog(null); void refreshSessions() }} onError={(cause) => showToast('error', messageOf(cause))} />}
            <Composer
              session={selectedSession}
              snapshot={snapshot}
              agentBusy={Boolean(agentBusy[selectedSession.id])}
              agentOptions={agentOptions[selectedSession.id] ?? []}
              selectedAgent={selectedSession.activeAgent ?? ''}
              onAgentChange={(agent) => requestAgent(selectedSession.id, agent)}
              onCommand={async (command) => {
                const result = await sendPiCommand(selectedSession.id, command)
                await refreshSnapshot(selectedSession.id)
                return result
              }}
              commands={snapshot.commands}
              running={selectedSession.status === 'running'}
              onSend={async (message, behavior) => {
                const command: JsonObject = { type: 'prompt', message }
                if (selectedSession.status === 'running') command.streamingBehavior = behavior
                await sendPiCommand(selectedSession.id, command)
              }}
              onAbort={() => sendPiCommand(selectedSession.id, { type: 'abort' })}
              onError={(cause) => showToast('error', messageOf(cause))}
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

      {directoryPickerOpen && <DirectoryPicker
        initialPath={workspacePath}
        onClose={() => setDirectoryPickerOpen(false)}
        onError={(cause) => showToast('error', messageOf(cause))}
        onSelect={(path) => {
          window.localStorage.setItem('pi-workbench.workspace-path', path)
          setWorkspacePath(path)
          setSelectedId('')
          setDirectoryPickerOpen(false)
          void refreshSessions(path)
        }}
      />}
      {toast && (
        <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span>{toast.message}</span>
          <button aria-label="Fermer la notification" className="toast-close" onClick={() => setToast(null)} type="button">×</button>
        </div>
      )}
      {dialog && !questionnaire && <ExtensionDialog dialog={dialog} onClose={() => { setDialog(null); void refreshSessions() }} onError={(cause) => showToast('error', messageOf(cause))} />}
    </div>
  )
}

function DirectoryPicker({ initialPath, onClose, onError, onSelect }: {
  initialPath: string
  onClose: () => void
  onError: (cause: unknown) => void
  onSelect: (path: string) => void
}) {
  const [listing, setListing] = useState<DirectoryListing | null>(null)

  const load = useCallback(async (path: string) => {
    try {
      setListing(await listDirectories(path))
    } catch (cause) {
      onError(cause)
    }
  }, [onError])

  useEffect(() => { void load(initialPath) }, [initialPath, load])

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="directory-picker-title" aria-modal="true" className="modal directory-picker" role="dialog">
        <h2 id="directory-picker-title">Choisir un dossier</h2>
        {listing ? <>
          <button className="directory-current" onClick={() => onSelect(listing.path)} type="button">Utiliser {listing.path}</button>
          <div className="directory-list">
            {listing.parentPath && <button onClick={() => void load(listing.parentPath as string)} type="button">⌃ Dossier parent</button>}
            {listing.directories.map((directory) => <button key={directory.path} onClick={() => void load(directory.path)} type="button">⌄ {directory.name}</button>)}
            {listing.directories.length === 0 && <p>Aucun sous-dossier.</p>}
          </div>
        </> : <p>Chargement des dossiers…</p>}
        <div className="modal-actions"><button onClick={onClose} type="button">Annuler</button></div>
      </section>
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

function Conversation({ messages, liveText, activity, agentName }: { messages: JsonObject[]; liveText: string; activity: Activity | null; agentName?: string }) {
  const visibleMessages = messages.filter(isVisibleConversationMessage)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    endRef.current?.scrollIntoView({ behavior })
  }, [visibleMessages.length, liveText, activity])
  return (
    <section className="conversation" aria-live="polite">
      {visibleMessages.map((message, index) => <MessageCard key={`${String(message.timestamp ?? '')}-${index}`} message={message} />)}
      {liveText && <article className="message assistant streaming"><div className="content"><Markdown>{liveText}</Markdown></div></article>}
      {activity && activity.kind !== 'writing' && <ActivityIndicator activity={activity} agentName={agentName} />}
      {visibleMessages.length === 0 && !liveText && !activity && <div className="empty-conversation"><h2>Session prête</h2><p>Envoyez un message ou utilisez une commande de votre installation Pi.</p></div>}
      <div ref={endRef} />
    </section>
  )
}

function MessageCard({ message }: { message: JsonObject }) {
  const role = String(message.role)
  return <article className={`message ${role}`}>{role === 'user' && <RoleLabel role={role} />}<div className="content">{renderContent(message.content ?? message.output)}</div></article>
}

function RoleLabel({ role }: { role: string }) {
  return <div className="role">{role === 'user' ? 'Vous' : role}</div>
}

function ActivityIndicator({ activity, agentName }: { activity: Activity; agentName?: string }) {
  return <div className="pi-activity" role="status"><span aria-hidden="true" className="spinner" /><span className="activity-text">{activityText(activity, agentName)}</span></div>
}

function isVisibleConversationMessage(message: JsonObject): boolean {
  const role = message.role
  return (role === 'user' || role === 'assistant') && hasVisibleText(message.content ?? message.output)
}

function hasVisibleText(content: unknown): boolean {
  if (typeof content === 'string') return content.trim().length > 0
  return Array.isArray(content) && content.some((part) => isObject(part) && part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0)
}

function renderContent(content: unknown): ReactNode {
  if (typeof content === 'string') return <Markdown>{content}</Markdown>
  if (!Array.isArray(content)) return null
  return content.map((part, index) => isObject(part) && part.type === 'text' && typeof part.text === 'string' ? <Markdown key={index}>{part.text}</Markdown> : null)
}

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown>{children}</ReactMarkdown>
}

function Composer({ session, snapshot, agentBusy, agentOptions, selectedAgent, onAgentChange, onCommand, commands, running, onSend, onAbort, onError }: {
  session: SessionSummary
  snapshot: SessionSnapshot
  agentBusy: boolean
  agentOptions: string[]
  selectedAgent: string
  onAgentChange: (agent: string) => void
  onCommand: (command: JsonObject) => Promise<JsonObject>
  commands: JsonObject[]
  running: boolean
  onSend: (message: string, behavior: 'steer' | 'followUp') => Promise<void>
  onAbort: () => Promise<JsonObject>
  onError: (cause: unknown) => void
}) {
  const [message, setMessage] = useState('')
  const [behavior, setBehavior] = useState<'steer' | 'followUp'>('steer')
  const model = isObject(snapshot.state?.model) ? snapshot.state.model : null
  const currentModel = model && typeof model.id === 'string' && typeof model.provider === 'string' ? `${model.provider}/${model.id}` : ''
  const thinking = typeof snapshot.state?.thinkingLevel === 'string' ? snapshot.state.thinkingLevel : 'off'

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    const nextMessage = message.trim()
    if (!nextMessage) return
    setMessage('')
    try { await onSend(nextMessage, behavior) } catch (cause) { setMessage(nextMessage); onError(cause) }
  }

  const stats = snapshot.stats
  const contextUsage = stats?.contextUsage
  const contextPercent = typeof contextUsage?.percent === 'number' ? `${Math.round(contextUsage.percent)}%` : '—'
  const contextTokens = typeof contextUsage?.tokens === 'number' && typeof contextUsage.contextWindow === 'number'
    ? `${formatTokens(contextUsage.tokens)} / ${formatTokens(contextUsage.contextWindow)}`
    : 'Indisponible'
  const cost = typeof stats?.cost === 'number' ? `$${stats.cost.toFixed(2)}` : '—'

  return (
    <form className="composer" onSubmit={(event) => void submit(event)}>
      <textarea aria-label="Message" value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
      }} placeholder="Demandez quelque chose à Pi…" rows={3} />
      <div className="composer-footer">
        <div className="composer-info" aria-label="Informations de la session">
          <div className="composer-session"><span className={`status-dot ${session.status}`} aria-hidden="true" /><strong>{session.name}</strong><span title={session.cwd}>{session.cwd}</span></div>
          <div className="composer-stats"><span><b>Coût</b>{cost}</span><span><b>Contexte</b>{contextPercent}<small>{contextTokens}</small></span></div>
        </div>
        <div className="composer-actions">
          <div className="composer-tools">
            <ComposerSelect
              ariaLabel="Modèle"
              onValueChange={(value) => {
                const selected = snapshot.models.find((item) => `${item.provider}/${item.id}` === value)
                if (selected) void onCommand({ type: 'set_model', provider: selected.provider, modelId: selected.id }).catch(onError)
              }}
              options={snapshot.models.map((item) => ({ label: String(item.name ?? item.id), value: `${item.provider}/${item.id}` }))}
              placeholder="Choisir un modèle"
              tone="model"
              value={currentModel}
            />
            <ComposerSelect
              ariaLabel="Niveau de réflexion"
              onValueChange={(value) => void onCommand({ type: 'set_thinking_level', level: value }).catch(onError)}
              options={['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) => ({ label: level, value: level }))}
              tone="thinking"
              value={thinking}
            />
            <ComposerSelect
              ariaLabel="Agent"
              disabled={agentBusy || agentOptions.length === 0}
              onValueChange={onAgentChange}
              options={agentOptions.map((agent) => ({ label: agent, value: agent }))}
              placeholder={agentBusy ? 'Chargement…' : 'Choisir un agent'}
              tone="agent"
              value={selectedAgent}
            />
            {commands.length > 0 && <ComposerSelect
              ariaLabel="Insérer une commande Pi"
              onValueChange={(value) => setMessage(`/${value} `)}
              options={commands.map((command) => ({ label: String(command.name), value: String(command.name) }))}
              placeholder="Commandes"
              tone="command"
              value=""
            />}
            {running && <ComposerSelect
              ariaLabel="Comportement du prochain message"
              onValueChange={(value) => setBehavior(value as 'steer' | 'followUp')}
              options={[{ label: 'Intervenir', value: 'steer' }, { label: 'À la suite', value: 'followUp' }]}
              tone="behavior"
              value={behavior}
            />}
            {running && <button className="danger" onClick={() => void onAbort().catch(onError)} type="button">Arrêter</button>}
          </div>
          <button type="submit">Envoyer <span>↵</span></button>
        </div>
      </div>
    </form>
  )
}

function ComposerSelect({ ariaLabel, disabled, onValueChange, options, placeholder, tone, value }: {
  ariaLabel: string
  disabled?: boolean
  onValueChange: (value: string) => void
  options: { label: string; value: string }[]
  placeholder?: string
  tone: 'agent' | 'behavior' | 'command' | 'model' | 'thinking'
  value: string
}) {
  return (
    <Select.Root disabled={disabled} onValueChange={onValueChange} value={value}>
      <Select.Trigger aria-label={ariaLabel} className={`composer-select ${tone}`}>
        <span className="composer-select-icon" aria-hidden="true" />
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

function AskUserQuestionDialog({ dialog, onClose, onError }: { dialog: UiDialog; onClose: () => void; onError: (cause: unknown) => void }) {
  const request = parseQuestionnaire(dialog.request)
  const [selectedOptions, setSelectedOptions] = useState<string[][]>(() => request.questions.map(() => []))
  const [freeText, setFreeText] = useState<string[]>(() => request.questions.map(() => ''))

  function toggle(questionIndex: number, option: string): void {
    setSelectedOptions((current) => current.map((selected, index) => {
      if (index !== questionIndex) return selected
      if (request.questions[index].multiSelect) return selected.includes(option) ? selected.filter((value) => value !== option) : [...selected, option]
      return selected[0] === option ? [] : [option]
    }))
  }

  async function respond(cancelled: boolean): Promise<void> {
    try {
      const value = cancelled
        ? { answers: [], cancelled: true }
        : {
            cancelled: false,
            answers: request.questions.map((question, index) => ({
              question: question.question,
              selectedOptions: selectedOptions[index],
              ...(freeText[index].trim() ? { text: freeText[index] } : {}),
            })),
          }
      await sendPiCommand(dialog.sessionId, { type: 'extension_ui_response', id: dialog.request.id, value: JSON.stringify(value) })
      onClose()
    } catch (cause) { onError(cause) }
  }

  const complete = request.questions.every((question, index) => selectedOptions[index].length > 0 || (!question.multiSelect && freeText[index].trim()))

  return (
    <section aria-labelledby="ask-user-question-title" className="ask-user-question" role="dialog">
      <div className="ask-user-question-heading"><span>Pi attend votre réponse</span><strong id="ask-user-question-title">Questionnaire</strong></div>
      <div className="ask-user-question-list">
        {request.questions.map((question, questionIndex) => <fieldset key={question.question}>
          <legend><span>{question.header}</span>{question.question}</legend>
          <div className="ask-user-options">
            {question.options.map((option) => {
              const selected = selectedOptions[questionIndex].includes(option.label)
              return <button aria-pressed={selected} className={selected ? 'selected' : ''} key={option.label} onClick={() => toggle(questionIndex, option.label)} type="button">
                <strong>{option.label}</strong><small>{option.description}</small>
              </button>
            })}
          </div>
          {!question.multiSelect && <textarea aria-label={`Réponse libre : ${question.question}`} onChange={(event) => setFreeText((current) => current.map((text, index) => index === questionIndex ? event.target.value : text))} placeholder="Ou saisissez votre propre réponse…" rows={2} value={freeText[questionIndex]} />}
        </fieldset>)}
      </div>
      <div className="ask-user-question-actions"><button onClick={() => void respond(true)} type="button">Annuler</button><button disabled={!complete} onClick={() => void respond(false)} type="button">Envoyer les réponses</button></div>
    </section>
  )
}

function parseQuestionnaire(request: JsonObject): AskUserQuestionRequest {
  const payload = typeof request.prefill === 'string' ? safeJsonParse(request.prefill) : null
  const questionnaire = parseAskUserQuestionRequest(payload)
  if (!questionnaire) throw new Error('Questionnaire Pi invalide')
  return questionnaire
}

function safeJsonParse(value: string): unknown {
  try { return JSON.parse(value) } catch { return null }
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

function isAskUserQuestionDialog(value: JsonObject): boolean {
  const payload = typeof value.prefill === 'string' ? safeJsonParse(value.prefill) : null
  return value.method === 'editor'
    && value.title === 'Pi Workbench questionnaire'
    && isObject(payload)
    && payload.protocol === askUserQuestionProtocol
    && parseAskUserQuestionRequest(payload) !== null
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

function formatTokens(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export default App
