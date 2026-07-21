import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import './App.css'
import { commitAndPush, createSession, getGitFileDiff, getGitSnapshot, getSnapshot, getVsCodeStatus, listRecentSessions, listSessions, openExplorer, openSession, openVsCode, revertGitCommit, sendPiCommand } from './api.ts'
import type { GitSnapshot, JsonObject, ManagerEvent, RecentSession, SessionSnapshot, SessionSummary } from '../shared/types.ts'
import { Composer } from './features/composer/Composer.tsx'
import { activityForPiEvent, waitingActivity, type Activity } from './features/conversation/activity.ts'
import { Conversation, type ToolExecution } from './features/conversation/Conversation.tsx'
import { toolCallInUpdate, type ToolResult } from './features/conversation/tool-calls.ts'
import { AskUserQuestionDialog, ExtensionDialog } from './features/dialogs/Dialogs.tsx'
import { isAgentSelector, isAskUserQuestionDialog, isBlockingDialog, type UiDialog } from './features/dialogs/dialog-protocol.ts'
import { clampGitSidebarWidth, readGitSidebarWidth } from './features/git/git-sidebar.ts'
import { RightSidebar } from './features/git/RightSidebar.tsx'
import { DirectoryPicker } from './features/workspace/DirectoryPicker.tsx'
import { recentWorkspaces } from './features/workspace/recent-workspaces.ts'
import { WorkspaceSidebar } from './features/workspace/WorkspaceSidebar.tsx'
import { CommandPalette, type PaletteCommand } from './features/commands/CommandPalette.tsx'
import { commandDefinitions, defaultShortcuts, lastAssistantText, shortcutFromEvent, type CommandId } from './features/commands/command-registry.ts'
import { SettingsPanel } from './features/settings/SettingsPanel.tsx'
import './features/commands/commands.css'

interface AgentIntent {
  value?: string
}

const emptySnapshot: SessionSnapshot = { state: null, messages: [], models: [], commands: [], stats: null }
/** Orchestre l'état de l'espace de travail, les événements Pi et les panneaux de l'interface. */
function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [workspacePath, setWorkspacePath] = useState(() => window.localStorage.getItem('pi-workbench.workspace-path') ?? '~/.pi')
  const [recentWorkspacePaths, setRecentWorkspacePaths] = useState(() => recentWorkspaces(window.localStorage.getItem('pi-workbench.workspace-path') ?? '~/.pi', readRecentWorkspaces()))
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(emptySnapshot)
  const [snapshotSessionId, setSnapshotSessionId] = useState('')
  const [liveText, setLiveText] = useState('')
  const [activity, setActivity] = useState<Activity | null>(null)
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([])
  const [detailedView, setDetailedView] = useState(() => window.localStorage.getItem('pi-workbench.detailed-view') === 'true')
  const [agentOptions, setAgentOptions] = useState<Record<string, string[]>>({})
  const [agentBusy, setAgentBusy] = useState<Record<string, boolean>>({})
  const [dialog, setDialog] = useState<UiDialog | null>(null)
  const [systemMessages, setSystemMessages] = useState<Record<string, JsonObject[]>>({})
  const [gitSnapshot, setGitSnapshot] = useState<GitSnapshot | null>(null)
  const [activeRightWidget, setActiveRightWidget] = useState<'git' | null>(() => window.localStorage.getItem('pi-workbench.git-sidebar-collapsed') === 'true' ? null : 'git')
  const [gitSidebarWidth, setGitSidebarWidth] = useState(() => readGitSidebarWidth(window.localStorage.getItem('pi-workbench.git-sidebar-width')))
  const [theme, setTheme] = useState(() => window.localStorage.getItem('pi-workbench.theme') ?? 'light')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [requestedSelect, setRequestedSelect] = useState<'agent' | 'model' | 'thinking' | null>(null)
  const [submitRequest, setSubmitRequest] = useState(0)
  const [focusComposerRequest, setFocusComposerRequest] = useState(0)
  const [scrollToBottomRequest, setScrollToBottomRequest] = useState(0)
  const [shortcuts, setShortcuts] = useState(() => readShortcuts())
  const selectedIdRef = useRef(selectedId)
  const refreshVersionRef = useRef(0)
  const gitRefreshVersionRef = useRef(0)
  const agentIntentsRef = useRef(new Map<string, AgentIntent>())
  selectedIdRef.current = selectedId

  const showToast = useCallback((kind: 'notice' | 'error', message: string) => {
    const sid = selectedIdRef.current || '__global__'
    setSystemMessages((current) => ({
      ...current,
      [sid]: [...(current[sid] ?? []), { role: 'system', content: message, kind, timestamp: Date.now() }],
    }))
  }, [])

  const updateGitSidebarWidth = useCallback((width: number) => {
    const nextWidth = clampGitSidebarWidth(width)
    window.localStorage.setItem('pi-workbench.git-sidebar-width', String(nextWidth))
    setGitSidebarWidth(nextWidth)
  }, [])

  /** Bascule le thème clair / sombre et persiste le choix dans le stockage local. */
  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem('pi-workbench.theme', next)
      return next
    })
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  /** Recharge les sessions et leurs demandes UI en ignorant les réponses obsolètes. */
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

  /** Actualise l'état Git du dossier courant sans afficher les erreurs des rafraîchissements silencieux. */
  const refreshGit = useCallback(async (cwd = workspacePath, notifyOnError = false) => {
    const version = ++gitRefreshVersionRef.current
    try {
      const nextSnapshot = await getGitSnapshot(cwd)
      if (version === gitRefreshVersionRef.current) setGitSnapshot(nextSnapshot)
    } catch (cause) {
      if (notifyOnError && version === gitRefreshVersionRef.current) showToast('error', messageOf(cause))
    }
  }, [showToast, workspacePath])

  /** Synchronise l'instantané de session et efface le texte diffusé lorsqu'un tour est terminé. */
  const refreshSnapshot = useCallback(async (sessionId: string, clearLiveText = false) => {
    if (!sessionId) {
      setSnapshot(emptySnapshot)
      setSnapshotSessionId('')
      return
    }
    try {
      setSnapshot(await getSnapshot(sessionId))
      setSnapshotSessionId(sessionId)
      if (clearLiveText && sessionId === selectedIdRef.current) setLiveText('')
    } catch (cause) {
      showToast('error', messageOf(cause))
    }
  }, [showToast])

  /** Demande la sélection d'un agent en évitant les requêtes concurrentes pour une session. */
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
  useEffect(() => void refreshGit(), [refreshGit])
  useEffect(() => {
    setSnapshot(emptySnapshot)
    setSnapshotSessionId('')
    setLiveText('')
    setActivity(null)
    setToolExecutions([])
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

    /** Traduit les événements reçus en mises à jour d'interface et en réponses UI éventuelles. */
    function handlePiEvent(sessionId: string, event: JsonObject): void {
      if (event.type === 'session_info_changed') {
        const name = typeof event.name === 'string' && event.name.trim() ? event.name.trim() : 'Nouvelle session'
        setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, name } : session))
        void refreshSessions()
      }
      if (event.type === 'agent_start') updateSessionStatus(sessionId, 'running')
      if (event.type === 'agent_settled') updateSessionStatus(sessionId, 'idle')
      if (event.type === 'tool_execution_end') void refreshGit()
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
      const streamedToolCall = toolCallInUpdate(event)
      if (streamedToolCall) startToolExecution(streamedToolCall)
      if (event.type === 'tool_execution_start' && typeof event.toolCallId === 'string' && typeof event.toolName === 'string') {
        startToolExecution({ id: event.toolCallId, name: event.toolName, args: event.args })
      }
      if (event.type === 'tool_execution_end' && typeof event.toolCallId === 'string' && typeof event.toolName === 'string') {
        const id = event.toolCallId
        const result: ToolResult = {
          toolCallId: id,
          toolName: event.toolName,
          content: event.result,
          isError: event.isError === true,
        }
        setToolExecutions((current) => current.map((execution) => execution.id === id ? { ...execution, result } : execution))
        void refreshSnapshot(sessionId)
      }
      setActivity((current) => activityForPiEvent(current, event))
      if (event.type === 'message_start') setLiveText('')
      if (event.type === 'message_update' && isObject(event.assistantMessageEvent)) {
        const update = event.assistantMessageEvent
        if (update.type === 'text_delta' && typeof update.delta === 'string') setLiveText((current) => current + update.delta)
      }
      if (event.type === 'message_end' || event.type === 'agent_settled') {
        void refreshSnapshot(sessionId, true)
        setFocusComposerRequest((current) => current + 1)
      }

      /** Remplace une exécution existante afin de conserver un seul état par appel d'outil. */
      function startToolExecution(call: { id: string; name: string; args: unknown }): void {
        setToolExecutions((current) => [
          ...current.filter((execution) => execution.id !== call.id),
          call,
        ])
      }
    }
  }, [refreshGit, refreshSessions, refreshSnapshot, showToast])

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

  /** Exécute une commande de productivité dans le contexte de la session active. */
  const executeCommand = useCallback((id: CommandId): void => {
    if (id === 'open-palette') { setCommandPaletteOpen(true); return }
    if (id === 'open-settings') { setSettingsOpen(true); return }
    if (id === 'new-session') { void createSession(workspacePath).then(async (session) => { await refreshSessions(); setSelectedId(session.id) }).catch((cause) => showToast('error', messageOf(cause))); return }
    if (id === 'send') { setSubmitRequest((current) => current + 1); return }
    if (id === 'abort' && selectedId) { void sendPiCommand(selectedId, { type: 'abort' }).catch((cause) => showToast('error', messageOf(cause))); return }
    if (id === 'toggle-git') { setActiveRightWidget((current) => current === null ? 'git' : null); return }
    if (id === 'open-agent' || id === 'open-model' || id === 'open-thinking') { setRequestedSelect(id === 'open-agent' ? 'agent' : id === 'open-model' ? 'model' : 'thinking'); return }
    if (id === 'copy-last-response') {
      const text = lastAssistantText(snapshot.messages)
      if (!text) { showToast('notice', 'Aucune réponse assistant à copier.'); return }
      void navigator.clipboard.writeText(text).then(() => showToast('notice', 'Dernière réponse copiée.')).catch((cause) => showToast('error', messageOf(cause)))
    }
  }, [refreshSessions, selectedId, showToast, snapshot.messages, workspacePath])

  const paletteCommands: PaletteCommand[] = useMemo(() => commandDefinitions.map((definition) => ({
    ...definition,
    shortcut: shortcuts[definition.id],
    disabled: (['send', 'abort', 'open-thinking', 'open-model', 'open-agent', 'copy-last-response'] as CommandId[]).includes(definition.id) && !selectedSession || (definition.id === 'abort' && selectedSession?.status !== 'running'),
    onExecute: () => executeCommand(definition.id),
  })), [executeCommand, selectedSession, shortcuts])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      const shortcut = shortcutFromEvent(event)
      const command = (Object.entries(shortcuts) as [CommandId, string | undefined][]).find(([, value]) => value === shortcut)?.[0]
      if (!command) return
      if (event.key === 'Escape' && (commandPaletteOpen || settingsOpen || dialog || document.querySelector('.composer-select-content,[data-radix-select-content],.slash-commands'))) return
      event.preventDefault()
      executeCommand(command)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandPaletteOpen, dialog, executeCommand, settingsOpen, shortcuts])

  const [vsCodeAvailable, setVsCodeAvailable] = useState<boolean | null>(null)
  useEffect(() => {
    let cancelled = false
    void getVsCodeStatus()
      .then(({ available }) => {
        if (!cancelled) setVsCodeAvailable(available)
      })
      .catch(() => {
        if (!cancelled) setVsCodeAvailable(false)
      })
    return () => { cancelled = true }
  }, [])

  /** Actions épinglées dans le rail droit, sans panneau associé. */
  const railActions = useMemo(() => [
    {
      key: 'explorer',
      icon: <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4l2 2h7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><path d="M3 9h18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>,
      label: 'Ouvrir le dossier dans l\'Explorateur',
      onClick: () => { void openExplorer(workspacePath).catch((cause) => showToast('error', messageOf(cause))) },
    },
    {
      key: 'vscode',
      icon: <span aria-hidden="true" className="code-symbol code-symbol-rail">{'<>'}</span>,
      label: vsCodeAvailable === null ? 'Vérification de VS Code…' : vsCodeAvailable ? 'Ouvrir le dossier dans VS Code' : 'VS Code indisponible',
      disabled: vsCodeAvailable !== true,
      onClick: () => { void openVsCode(workspacePath).catch((cause) => { setVsCodeAvailable(false); showToast('error', messageOf(cause)) }) },
    },
  ], [showToast, vsCodeAvailable, workspacePath])

  const rightSidebarVisible = Boolean(gitSnapshot?.repository) || railActions.length > 0

  return (
    <div
      className={`app-shell${rightSidebarVisible ? activeRightWidget ? ' git-sidebar-visible' : ' git-sidebar-collapsed' : ''}`}
      style={{ '--git-sidebar-width': `${gitSidebarWidth}px` } as CSSProperties}
    >
      <WorkspaceSidebar
        recentSessions={recentSessions}
        sessions={sessions}
        selectedId={selectedId}
        workspacePath={workspacePath}
        onChooseWorkspace={() => setDirectoryPickerOpen(true)}
        onCreate={async () => {
          const session = await createSession(workspacePath)
          await refreshSessions()
          setSelectedId(session.id)
        }}
        onOpenSession={async (recentSession) => {
          const session = await openSession(workspacePath, recentSession.sessionPath)
          await refreshSessions()
          setSelectedId(session.id)
        }}
        onSelectSession={setSelectedId}
        onError={(cause) => showToast('error', messageOf(cause))}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="workspace">
        {selectedSession ? (
          <>
            <Conversation activity={activity} agentName={selectedSession.activeAgent} detailedView={detailedView} liveText={liveText} messages={snapshot.messages} repositoryRoot={gitSnapshot?.root} scrollToBottomRequest={scrollToBottomRequest} systemMessages={systemMessages[selectedSession.id] ?? []} toolExecutions={toolExecutions} workspacePath={workspacePath} />
            <button aria-label={detailedView ? 'Vue simplifiée' : 'Vue détaillée'} aria-pressed={detailedView} className={`chat-detail-toggle${detailedView ? ' active' : ''}`} onClick={() => setDetailedView((current) => {
                const next = !current
                window.localStorage.setItem('pi-workbench.detailed-view', String(next))
                return next
              })} title={detailedView ? 'Vue simplifiée' : 'Vue détaillée'} type="button">
              <span aria-hidden="true">⌘</span>
            </button>
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
              agentLoading={snapshotSessionId !== selectedSession.id}
              focusRequest={focusComposerRequest}
              showAgentSelector={snapshotSessionId !== selectedSession.id || snapshot.commands.some((command) => command.name === 'agent')}
              running={selectedSession.status === 'running'}
              onSend={async (message, images, behavior) => {
                const command: JsonObject = { type: 'prompt', message, images }
                if (selectedSession.status === 'running') command.streamingBehavior = behavior
                await sendPiCommand(selectedSession.id, command)
                await refreshSessions()
                setScrollToBottomRequest((current) => current + 1)
              }}
              onAbort={() => sendPiCommand(selectedSession.id, { type: 'abort' })}
              onError={(cause) => showToast('error', messageOf(cause))}
              requestedSelect={requestedSelect}
              onSelectOpened={() => setRequestedSelect(null)}
              submitRequest={submitRequest}
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

      {rightSidebarVisible && <RightSidebar
        activeWidget={activeRightWidget}
        onResize={updateGitSidebarWidth}
        snapshot={gitSnapshot?.repository ? gitSnapshot : null}
        width={gitSidebarWidth}
        railActions={railActions}
        onAction={async (message) => {
          const result = await commitAndPush(workspacePath, message)
          await refreshGit(workspacePath, true)
          if (result.pushError) showToast('error', `${result.committed ? 'Commit créé, mais' : 'Push'} échoué : ${result.pushError}`)
          else showToast('notice', result.committed ? 'Commit créé et poussé.' : 'Commits poussés.')
          return result
        }}
        onError={(cause) => showToast('error', messageOf(cause))}
        onFileSelect={(path, commitHash) => getGitFileDiff(workspacePath, path, commitHash)}
        onRefresh={() => void refreshGit(workspacePath, true)}
        onRevert={async (hash) => {
          const result = await revertGitCommit(workspacePath, hash)
          await refreshGit(workspacePath, true)
          showToast('notice', `Commit ${hash.slice(0, 7)} revert.`)
          return result
        }}
        onWidgetSelect={() => setActiveRightWidget((current) => {
          const next = current === null ? 'git' : null
          window.localStorage.setItem('pi-workbench.git-sidebar-collapsed', String(next === null))
          return next
        })}
      />}

      {directoryPickerOpen && <DirectoryPicker
        initialPath={workspacePath}
        recentPaths={recentWorkspacePaths}
        onClose={() => setDirectoryPickerOpen(false)}
        onError={(cause) => showToast('error', messageOf(cause))}
        onSelect={(path) => {
          window.localStorage.setItem('pi-workbench.workspace-path', path)
          const nextRecentWorkspacePaths = recentWorkspaces(path, recentWorkspacePaths)
          window.localStorage.setItem('pi-workbench.recent-workspace-paths', JSON.stringify(nextRecentWorkspacePaths))
          setRecentWorkspacePaths(nextRecentWorkspacePaths)
          setGitSnapshot(null)
          setActiveRightWidget(null)
          setWorkspacePath(path)
          setSelectedId('')
          setDirectoryPickerOpen(false)
          void refreshSessions(path)
        }}
      />}
      {dialog && !questionnaire && <ExtensionDialog dialog={dialog} onClose={() => { setDialog(null); void refreshSessions() }} onError={(cause) => showToast('error', messageOf(cause))} />}
      {commandPaletteOpen && <CommandPalette commands={paletteCommands} onClose={() => setCommandPaletteOpen(false)} />}
      {settingsOpen && <SettingsPanel definitions={commandDefinitions} shortcuts={shortcuts} onChange={(id, shortcut) => { const next = { ...shortcuts, [id]: shortcut }; setShortcuts(next); window.localStorage.setItem('pi-workbench.shortcuts', JSON.stringify(next)) }} onReset={() => { setShortcuts(defaultShortcuts); window.localStorage.setItem('pi-workbench.shortcuts', JSON.stringify(defaultShortcuts)) }} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

/** Lit une éventuelle ancienne liste invalide sans empêcher l'ouverture de l'application. */
function readShortcuts(): Partial<Record<CommandId, string>> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem('pi-workbench.shortcuts') ?? 'null')
    return isObject(value) ? { ...defaultShortcuts, ...Object.fromEntries(Object.entries(value).filter(([key, shortcut]) => commandDefinitions.some((definition) => definition.id === key) && typeof shortcut === 'string')) as Partial<Record<CommandId, string>> } : defaultShortcuts
  } catch { return defaultShortcuts }
}

function readRecentWorkspaces(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem('pi-workbench.recent-workspace-paths') ?? '[]')
    return Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string') : []
  } catch {
    return []
  }
}

function isManagerEvent(value: unknown): value is ManagerEvent {
  return isObject(value) && value.kind === 'event' && typeof value.event === 'string' && typeof value.sessionId === 'string'
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export default App
