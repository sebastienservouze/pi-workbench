import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import './App.css'
import { commitAndPush, createSession, getGitFileDiff, getGitSnapshot, getQuotas, getSnapshot, getVsCodeStatus, listRecentSessions, listSessions, openExplorer, openSession, openVsCode, refreshQuotas, revertGitCommit, sendPiCommand } from './api.ts'
import { quotaRefreshAllowed } from '../shared/quota-refresh.ts'
import type { GitSnapshot, JsonObject, ManagerEvent, QuotaSnapshot, RecentSession, SessionSnapshot, SessionSummary } from '../shared/types.ts'
import { Composer } from './features/composer/Composer.tsx'
import { promptSessionTitle } from './features/composer/prompt-title.ts'
import { ToastStack, type Toast } from './features/notifications/ToastStack.tsx'
import { activityForPiEvent, sessionActivity, sessionIndicator, type Activity, type PiConnection } from './features/conversation/activity.ts'
import { Conversation } from './features/conversation/Conversation.tsx'
import { applyToolCallUpdate, interruptToolCallGeneration, toolCallInUpdate, type ToolExecution, type ToolResult } from './features/conversation/tool-calls.ts'
import { AskUserQuestionDialog, ExtensionDialog } from './features/dialogs/Dialogs.tsx'
import { isAgentSelector, isAskUserQuestionDialog, isBlockingDialog, type UiDialog } from './features/dialogs/dialog-protocol.ts'
import { clampRightSidebarWidth, isRightWidget, readRightSidebarWidth, type RightWidget } from './features/right-sidebar/right-sidebar.ts'
import { RightSidebar } from './features/right-sidebar/RightSidebar.tsx'
import { quotaProviderForModel } from './features/quotas/quota-display.ts'
import { DirectoryPicker } from './features/workspace/DirectoryPicker.tsx'
import { recentWorkspaces } from './features/workspace/recent-workspaces.ts'
import { WorkspaceSidebar } from './features/workspace/WorkspaceSidebar.tsx'
import { CommandPalette, type PaletteCommand } from './features/commands/CommandPalette.tsx'
import { commandDefinitions, defaultShortcuts, lastAssistantText, rightWidgetFromCommand, shortcutFromEvent, type CommandId } from './features/commands/command-registry.ts'
import { SettingsPanel } from './features/settings/SettingsPanel.tsx'
import { analyzeSession, type SessionAnalysisTarget } from './features/session-analysis/session-analysis.ts'
import './features/commands/commands.css'

interface AgentIntent {
  value?: string
}

const emptySnapshot: SessionSnapshot = { state: null, messages: [], models: [], commands: [], stats: null }
const emptyAgentOptions: string[] = []
const conversationViewDetails = {
  simple: { label: 'Simplified view', description: 'Messages only, without tool calls' },
  detailed: { label: 'Detailed view', description: 'Visible calls with expandable preview' },
} as const
/** Orchestrates workspace state, Pi events, and UI panels. */
function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [workspacePath, setWorkspacePath] = useState(() => window.localStorage.getItem('pi-workbench.workspace-path') ?? '~/.pi')
  const [recentWorkspacePaths, setRecentWorkspacePaths] = useState(() => recentWorkspaces(window.localStorage.getItem('pi-workbench.workspace-path') ?? '~/.pi', readRecentWorkspaces()))
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(() => window.localStorage.getItem('pi-workbench.selected-session') ?? '')
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(emptySnapshot)
  const [snapshotSessionId, setSnapshotSessionId] = useState('')
  const [liveText, setLiveText] = useState('')
  const [liveThinking, setLiveThinking] = useState('')
  const [activity, setActivity] = useState<Activity | null>(null)
  const [piConnection, setPiConnection] = useState<PiConnection>('connecting')
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([])
  const [conversationView, setConversationView] = useState<'detailed' | 'simple'>(() => {
    const stored = window.localStorage.getItem('pi-workbench.conversation-view')
    if (stored === 'detailed' || stored === 'simple-expanded') return 'detailed'
    return window.localStorage.getItem('pi-workbench.detailed-view') === 'true' ? 'detailed' : 'simple'
  })
  const conversationViewDetail = conversationViewDetails[conversationView]
  const [agentOptions, setAgentOptions] = useState<Record<string, string[]>>({})
  const [agentBusy, setAgentBusy] = useState<Record<string, boolean>>({})
  const [dialog, setDialog] = useState<UiDialog | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [gitSnapshot, setGitSnapshot] = useState<GitSnapshot | null>(null)
  const [quotas, setQuotas] = useState<QuotaSnapshot | null>(null)
  const [activeRightWidget, setActiveRightWidget] = useState<RightWidget | null>(readActiveRightWidget)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => readRightSidebarWidth(window.localStorage.getItem('pi-workbench.right-sidebar-width') ?? window.localStorage.getItem('pi-workbench.git-sidebar-width')))
  const [theme, setTheme] = useState(() => window.localStorage.getItem('pi-workbench.theme') ?? 'light')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [creatingSession, setCreatingSession] = useState(false)
  const [requestedSelect, setRequestedSelect] = useState<'agent' | 'model' | 'thinking' | null>(null)
  const [submitRequest, setSubmitRequest] = useState(0)
  const [focusComposerRequest, setFocusComposerRequest] = useState(0)
  const [composerDraftRequest, setComposerDraftRequest] = useState<{ id: string; message: string; sessionId: string }>()
  const [scrollToBottomRequest, setScrollToBottomRequest] = useState(0)
  const [conversationNavigation, setConversationNavigation] = useState<{ id: number; target: SessionAnalysisTarget }>()
  const [observedToolDurations, setObservedToolDurations] = useState<ReadonlyMap<string, number>>(new Map())
  const [observedRequestDurations, setObservedRequestDurations] = useState<ReadonlyMap<number, number>>(new Map())
  const [shortcuts, setShortcuts] = useState(() => readShortcuts())
  const selectedIdRef = useRef(selectedId)
  const creatingSessionRef = useRef(false)
  const refreshVersionRef = useRef(0)
  const gitRefreshVersionRef = useRef(0)
  const agentIntentsRef = useRef(new Map<string, AgentIntent>())
  const toolStartedAtRef = useRef(new Map<string, number>())
  const requestStartedAtRef = useRef<number | undefined>(undefined)
  const pendingLiveUpdatesRef = useRef({ text: '', thinking: '' })
  const liveUpdateFrameRef = useRef<number | undefined>(undefined)
  const quotaAutoRefreshAtRef = useRef(new Map<string, number>())
  const quotasRef = useRef(quotas)
  const model = isObject(snapshot.state?.model) ? snapshot.state.model : undefined
  const currentQuotaProvider = quotaProviderForModel(model?.provider)
  const currentQuotaProviderRef = useRef(currentQuotaProvider)
  selectedIdRef.current = selectedId
  quotasRef.current = quotas
  currentQuotaProviderRef.current = currentQuotaProvider

  const showToast = useCallback((kind: Toast['kind'], message: string, sessionId = selectedIdRef.current) => {
    const toast = { id: crypto.randomUUID(), kind, message, sessionId }
    setToasts((current) => [...current, toast])
    if (kind !== 'error') window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3000)
  }, [])

  /** Removes a toast after explicit dismissal or automatic timeout. */
  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const visibleToasts = toasts.filter((toast) => toast.sessionId === null || toast.sessionId === selectedId)

  /** Applies accumulated stream deltas at most once per rendered frame. */
  const flushLiveUpdates = useCallback(() => {
    if (liveUpdateFrameRef.current !== undefined) window.cancelAnimationFrame(liveUpdateFrameRef.current)
    liveUpdateFrameRef.current = undefined
    const pending = pendingLiveUpdatesRef.current
    pendingLiveUpdatesRef.current = { text: '', thinking: '' }
    if (pending.text) setLiveText((current) => current + pending.text)
    if (pending.thinking) setLiveThinking((current) => current + pending.thinking)
  }, [])

  /** Queues a stream delta without rerendering the whole workspace for every SSE event. */
  const queueLiveUpdate = useCallback((kind: 'text' | 'thinking', delta: string) => {
    pendingLiveUpdatesRef.current[kind] += delta
    if (liveUpdateFrameRef.current !== undefined) return
    liveUpdateFrameRef.current = window.requestAnimationFrame(flushLiveUpdates)
  }, [flushLiveUpdates])

  /** Cancels stream work that belongs to a response or session no longer displayed. */
  const clearPendingLiveUpdates = useCallback(() => {
    if (liveUpdateFrameRef.current !== undefined) window.cancelAnimationFrame(liveUpdateFrameRef.current)
    liveUpdateFrameRef.current = undefined
    pendingLiveUpdatesRef.current = { text: '', thinking: '' }
  }, [])

  const updateRightSidebarWidth = useCallback((width: number) => {
    const nextWidth = clampRightSidebarWidth(width)
    window.localStorage.setItem('pi-workbench.right-sidebar-width', String(nextWidth))
    setRightSidebarWidth(nextWidth)
  }, [])

  const openRightWidget = useCallback((widget: RightWidget) => {
    window.localStorage.setItem('pi-workbench.right-sidebar-widget', widget)
    setActiveRightWidget(widget)
  }, [])

  /** Toggles light/dark theme and persists the choice in local storage. */
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

  useEffect(() => {
    if (selectedId) window.localStorage.setItem('pi-workbench.selected-session', selectedId)
    else window.localStorage.removeItem('pi-workbench.selected-session')
  }, [selectedId])

  /** Reloads sessions and their UI requests while discarding stale responses. */
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
      ).find(({ request }) => !isAgentSelector(request))
      if (pending) setDialog(pending)
    } catch (cause) {
      if (version === refreshVersionRef.current) showToast('error', messageOf(cause))
    }
  }, [showToast, workspacePath])

  /** Refreshes Git state for the current directory without showing silent refresh errors. */
  const refreshGit = useCallback(async (cwd = workspacePath, notifyOnError = false) => {
    const version = ++gitRefreshVersionRef.current
    try {
      const nextSnapshot = await getGitSnapshot(cwd)
      if (version === gitRefreshVersionRef.current) setGitSnapshot(nextSnapshot)
    } catch (cause) {
      if (notifyOnError && version === gitRefreshVersionRef.current) showToast('error', messageOf(cause))
    }
  }, [showToast, workspacePath])

  /** Synchronizes the session snapshot and clears streamed text when a turn completes. */
  const refreshSnapshot = useCallback(async (sessionId: string, clearLiveText = false) => {
    if (!sessionId) {
      setSnapshot(emptySnapshot)
      setSnapshotSessionId('')
      return
    }
    try {
      const nextSnapshot = await getSnapshot(sessionId)
      setSnapshot(nextSnapshot)
      setSnapshotSessionId(sessionId)
      if (clearLiveText && sessionId === selectedIdRef.current) setLiveText('')
      return nextSnapshot
    } catch (cause) {
      showToast('error', messageOf(cause))
    }
  }, [showToast])

  /** Refreshes quotas, allowing manual clicks to bypass automatic throttling. */
  const refreshSessionQuotas = useCallback(async (sessionId: string, automatic: boolean): Promise<void> => {
    if (!sessionId) throw new Error('An open Pi session is required to refresh quotas.')
    if (automatic) {
      const provider = currentQuotaProviderRef.current
      if (!provider) return
      const lastRefreshAt = Math.max(quotasRef.current?.[provider].updatedAt ?? 0, quotaAutoRefreshAtRef.current.get(sessionId) ?? 0)
      const now = Date.now()
      if (!quotaRefreshAllowed(lastRefreshAt, true, now)) return
      quotaAutoRefreshAtRef.current.set(sessionId, now)
    }
    try {
      setQuotas((current) => current && { ...current, refreshing: true })
      setQuotas(await refreshQuotas(sessionId, automatic))
    } catch (cause) {
      if (!automatic) showToast('error', messageOf(cause))
      setQuotas(await getQuotas().catch(() => quotasRef.current))
    }
  }, [showToast])

  /** Requests agent selection while avoiding concurrent requests for a session. */
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
  useEffect(() => { void getQuotas().then(setQuotas).catch(() => undefined) }, [])
  useEffect(() => {
    clearPendingLiveUpdates()
    setSnapshot(emptySnapshot)
    setSnapshotSessionId('')
    setLiveText('')
    setLiveThinking('')
    setActivity(null)
    setToolExecutions([])
    setConversationNavigation(undefined)
    setObservedToolDurations(new Map())
    setObservedRequestDurations(new Map())
    toolStartedAtRef.current.clear()
    requestStartedAtRef.current = undefined
    void refreshSnapshot(selectedId)
  }, [clearPendingLiveUpdates, refreshSnapshot, selectedId])

  useEffect(() => {
    const events = new EventSource('/api/events')
    events.onmessage = ({ data }) => {
      const event: unknown = JSON.parse(data)
      if (!isManagerEvent(event)) return
      if (event.event === 'manager_connected' || event.event === 'manager_disconnected') {
        setPiConnection(event.event === 'manager_connected' ? 'connected' : 'disconnected')
        setActivity(null)
      }
      if (event.event === 'manager_connected' || event.event === 'session_created' || event.event === 'session_exited') void refreshSessions()
      if (event.event !== 'pi' || !isObject(event.data)) return
      handlePiEvent(event.sessionId, event.data)
    }
    events.onerror = () => {
      setPiConnection('connecting')
      setActivity(null)
      showToast('error', 'Connection to backend lost; retrying.')
    }
    return () => events.close()

    /** Translates received events into UI updates and possible UI responses. */
    function handlePiEvent(sessionId: string, event: JsonObject): void {
      if (event.type === 'session_info_changed') {
        const name = typeof event.name === 'string' && event.name.trim() ? event.name.trim() : 'New session'
        setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, name } : session))
        void refreshSessions()
      }
      if (event.type === 'agent_start') updateSessionStatus(sessionId, 'running')
      if (event.type === 'agent_settled') updateSessionStatus(sessionId, 'idle')
      if (event.type === 'auto_retry_end' && event.success === false && typeof event.finalError === 'string') {
        showToast('error', `Provider connection failed after retries: ${event.finalError}`, sessionId)
      }
      if (event.type === 'tool_execution_end') void refreshGit()
      if (event.type === 'extension_ui_request' && event.method === 'setStatus' && event.statusKey === 'agent') {
        updateSessionAgent(sessionId, typeof event.activeAgent === 'string' ? event.activeAgent : undefined)
      }
      if (event.type === 'extension_ui_request' && event.method === 'setStatus' && event.statusKey === 'pi-workbench.quotas') {
        void getQuotas().then(setQuotas).catch(() => undefined)
      }

      if (sessionId === selectedIdRef.current && event.type === 'extension_ui_request' && isBlockingDialog(event) && !isAgentSelector(event)) {
        setActivity(null)
      }

      if (event.type === 'extension_ui_request') {
        if (creatingSessionRef.current && (event.method === 'notify' || (event.method === 'setStatus' && event.statusKey === 'agent'))) {
          setSelectedId(sessionId)
          creatingSessionRef.current = false
        }
        if (event.method === 'notify' && typeof event.message === 'string') showToast('notice', event.message, sessionId)
        const agentIntent = agentIntentsRef.current.get(sessionId)
        if (isAgentSelector(event)) {
          const options = event.options.filter((option): option is string => typeof option === 'string')
          if (agentIntent) {
            setAgentOptions((current) => ({ ...current, [sessionId]: options }))
            agentIntentsRef.current.delete(sessionId)
          }

          const selectedAgent = agentIntent?.value && options.includes(agentIntent.value) ? agentIntent.value : undefined
          const response = selectedAgent ? { value: selectedAgent } : { cancelled: true }
          void sendPiCommand(sessionId, { type: 'extension_ui_response', id: event.id, ...response })
            .then(() => refreshSnapshot(sessionId))
            .catch((cause) => showToast('error', messageOf(cause)))
          if (agentIntent?.value && !selectedAgent) showToast('error', 'Selected agent is no longer available.')
          return
        }
        if (isBlockingDialog(event)) setDialog({ sessionId, request: event })
      }

      if (sessionId !== selectedIdRef.current) return
      if (event.type === 'agent_start') requestStartedAtRef.current = performance.now()
      const streamedToolCall = toolCallInUpdate(event)
      if (streamedToolCall) {
        setToolExecutions((current) => applyToolCallUpdate(current, streamedToolCall, crypto.randomUUID()))
      }
      if (event.type === 'tool_execution_start' && typeof event.toolCallId === 'string' && typeof event.toolName === 'string') {
        toolStartedAtRef.current.set(event.toolCallId, performance.now())
        startToolExecution({ id: event.toolCallId, name: event.toolName, args: event.args })
      }
      if (event.type === 'tool_execution_end' && typeof event.toolCallId === 'string' && typeof event.toolName === 'string') {
        const id = event.toolCallId
        const startedAt = toolStartedAtRef.current.get(id)
        if (startedAt !== undefined) {
          setObservedToolDurations((current) => new Map(current).set(id, performance.now() - startedAt))
          toolStartedAtRef.current.delete(id)
        }
        const result: ToolResult = {
          toolCallId: id,
          toolName: event.toolName,
          content: event.result,
          isError: event.isError === true,
        }
        setToolExecutions((current) => current.map((execution) => execution.id === id ? { ...execution, result } : execution))
        void refreshSnapshot(sessionId)
      }
      setActivity((current) => {
        const next = activityForPiEvent(current, event)
        return next?.kind === current?.kind ? current : next
      })
      if (event.type === 'message_start') {
        clearPendingLiveUpdates()
        setToolExecutions(interruptToolCallGeneration)
        setLiveText('')
        setLiveThinking('')
      }
      if (event.type === 'message_update' && isObject(event.assistantMessageEvent)) {
        const update = event.assistantMessageEvent
        if (update.type === 'thinking_delta' && typeof update.delta === 'string') queueLiveUpdate('thinking', update.delta)
        if (update.type === 'text_delta' && typeof update.delta === 'string') queueLiveUpdate('text', update.delta)
        if (update.type === 'error') setToolExecutions(interruptToolCallGeneration)
      }
      const settledRequestDuration = event.type === 'agent_settled' && requestStartedAtRef.current !== undefined
        ? performance.now() - requestStartedAtRef.current
        : undefined
      if (event.type === 'agent_settled') {
        requestStartedAtRef.current = undefined
        void refreshSessionQuotas(sessionId, true)
      }
      if (event.type === 'message_end' || event.type === 'agent_settled') {
        flushLiveUpdates()
        setToolExecutions(interruptToolCallGeneration)
        void refreshSnapshot(sessionId, true).then((nextSnapshot) => {
          if (!nextSnapshot || settledRequestDuration === undefined) return
          const requestTimestamp = lastUserTimestamp(nextSnapshot.messages)
          if (requestTimestamp !== undefined) setObservedRequestDurations((current) => new Map(current).set(requestTimestamp, settledRequestDuration))
        }).finally(() => {
          if (sessionId === selectedIdRef.current) setLiveThinking('')
        })
        if (event.type === 'agent_settled') setFocusComposerRequest((current) => current + 1)
      }

      /** Replaces an existing execution to keep a single state per tool call. */
      function startToolExecution(call: { id: string; name: string; args: unknown }): void {
        setToolExecutions((current) => [
          ...current.filter((execution) => execution.id !== call.id),
          { ...call, status: 'running' },
        ])
      }
    }
  }, [clearPendingLiveUpdates, flushLiveUpdates, queueLiveUpdate, refreshGit, refreshSessionQuotas, refreshSessions, refreshSnapshot, showToast])

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
  const selectedSessionStatus = selectedSession?.status
  const displayedActivity = selectedSession ? sessionActivity(activity, selectedSession.status, piConnection) : null
  const handleConversationError = useCallback((cause: unknown) => showToast('error', messageOf(cause)), [showToast])
  const handleComposerAgentChange = useCallback((agent: string) => requestAgent(selectedId, agent), [requestAgent, selectedId])
  /** Executes a composer command and synchronizes capabilities affected by it. */
  const handleComposerCommand = useCallback(async (command: JsonObject) => {
    const result = await sendPiCommand(selectedId, command)
    await refreshSnapshot(selectedId)
    return result
  }, [refreshSnapshot, selectedId])
  /** Sends the current draft with the behavior supported by the active session. */
  const handleComposerSend = useCallback(async (message: string, images: JsonObject[], behavior: 'steer' | 'followUp') => {
    const command: JsonObject = { type: 'prompt', message, images }
    if (selectedSessionStatus === 'running') command.streamingBehavior = behavior
    if (selectedSession?.name === 'Nouvelle session' && !snapshot.messages.some((entry) => entry.role === 'user')) {
      setSessions((current) => current.map((session) => session.id === selectedId
        ? { ...session, name: promptSessionTitle(message) }
        : session))
    }
    await sendPiCommand(selectedId, command)
    await refreshSessions()
    setScrollToBottomRequest((current) => current + 1)
  }, [refreshSessions, selectedId, selectedSession?.name, selectedSessionStatus, snapshot.messages])
  const handleComposerAbort = useCallback(() => sendPiCommand(selectedId, { type: 'abort' }), [selectedId])
  const handleComposerSelectOpened = useCallback(() => setRequestedSelect(null), [])
  const sessionAnalysis = useMemo(() => selectedSession && snapshotSessionId === selectedSession.id
    ? analyzeSession(snapshot.messages, snapshot.stats, selectedSession.status === 'running', {
      requestDurations: observedRequestDurations,
      toolDurations: observedToolDurations,
      toolExecutions,
    })
    : null, [observedRequestDurations, observedToolDurations, selectedSession, snapshot.messages, snapshot.stats, snapshotSessionId, toolExecutions])
  const questionnaire = dialog && dialog.sessionId === selectedId && isAskUserQuestionDialog(dialog.request) ? dialog : null

  /** Launches and selects a session, then sends a message or prepares a draft depending on the source action. */
  const startAndSelectSession = useCallback(async (start: () => Promise<SessionSummary>, initialMessage?: string, draftMessage?: string): Promise<void> => {
    creatingSessionRef.current = true
    setCreatingSession(true)
    setSelectedId('')
    try {
      const session = await start()
      await refreshSessions()
      setSelectedId(session.id)
      if (draftMessage) setComposerDraftRequest({ id: crypto.randomUUID(), message: draftMessage, sessionId: session.id })
      if (initialMessage) {
        setSessions((current) => current.map((currentSession) => currentSession.id === session.id
          ? { ...currentSession, name: promptSessionTitle(initialMessage) }
          : currentSession))
        await sendPiCommand(session.id, { type: 'prompt', message: initialMessage })
        await refreshSessions()
        setScrollToBottomRequest((current) => current + 1)
      }
      creatingSessionRef.current = false
      setCreatingSession(false)
    } catch (cause) {
      creatingSessionRef.current = false
      setCreatingSession(false)
      showToast('error', messageOf(cause))
    }
  }, [refreshSessions, showToast])

  const handleContextSessionStart = useCallback((draft: string) => startAndSelectSession(() => createSession(workspacePath), undefined, draft), [startAndSelectSession, workspacePath])

  const markComposerDraftApplied = useCallback((id: string) => {
    setComposerDraftRequest((current) => current?.id === id ? undefined : current)
  }, [])

  /** Executes a productivity command in the context of the active session. */
  const executeCommand = useCallback((id: CommandId): void => {
    const rightWidget = rightWidgetFromCommand(id)
    if (rightWidget) {
      if ((rightWidget === 'analysis' && !sessionAnalysis) || (rightWidget === 'git' && !gitSnapshot?.repository)) return
      openRightWidget(rightWidget)
      return
    }
    if (id === 'open-palette') { setCommandPaletteOpen(true); return }
    if (id === 'open-settings') { setSettingsOpen(true); return }
    if (id === 'new-session') { void startAndSelectSession(() => createSession(workspacePath)).catch((cause) => showToast('error', messageOf(cause))); return }
    if (id === 'send') { setSubmitRequest((current) => current + 1); return }
    if (id === 'abort' && selectedId) { void sendPiCommand(selectedId, { type: 'abort' }).catch((cause) => showToast('error', messageOf(cause))); return }
    if (id === 'open-agent' || id === 'open-model' || id === 'open-thinking') { setRequestedSelect(id === 'open-agent' ? 'agent' : id === 'open-model' ? 'model' : 'thinking'); return }
    if (id === 'copy-last-response') {
      const text = lastAssistantText(snapshot.messages)
      if (!text) { showToast('notice', 'No assistant response to copy.'); return }
      void navigator.clipboard.writeText(text).then(() => showToast('notice', 'Last response copied.')).catch((cause) => showToast('error', messageOf(cause)))
    }
  }, [gitSnapshot?.repository, openRightWidget, selectedId, sessionAnalysis, showToast, snapshot.messages, startAndSelectSession, workspacePath])

  const paletteCommands: PaletteCommand[] = useMemo(() => commandDefinitions.map((definition) => {
    const rightWidget = rightWidgetFromCommand(definition.id)
    const unavailableWidget = (rightWidget === 'analysis' && !sessionAnalysis) || (rightWidget === 'git' && !gitSnapshot?.repository)
    return {
      ...definition,
      shortcut: shortcuts[definition.id],
      disabled: unavailableWidget || (['send', 'abort', 'open-thinking', 'open-model', 'open-agent', 'copy-last-response'] as CommandId[]).includes(definition.id) && !selectedSession || (definition.id === 'abort' && selectedSession?.status !== 'running'),
      onExecute: () => executeCommand(definition.id),
    }
  }), [executeCommand, gitSnapshot?.repository, selectedSession, sessionAnalysis, shortcuts])

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

  /** Positions the conversation on the element chosen from session analysis. */
  const navigateToAnalysisTarget = useCallback((target: SessionAnalysisTarget): void => {
    if (target.kind === 'tool' || target.kind === 'turn') {
      setConversationView('detailed')
      window.localStorage.setItem('pi-workbench.conversation-view', 'detailed')
    }
    setConversationNavigation((current) => ({ id: (current?.id ?? 0) + 1, target }))
  }, [])

  /** Actions pinned to the right rail without an associated panel. */
  const railActions = useMemo(() => [
    {
      key: 'explorer',
      icon: <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4l2 2h7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><path d="M3 9h18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>,
      label: 'Open folder in Explorer',
      onClick: () => { void openExplorer(workspacePath).catch((cause) => showToast('error', messageOf(cause))) },
    },
    {
      key: 'vscode',
      icon: <span aria-hidden="true" className="code-symbol code-symbol-rail">{'<>'}</span>,
      label: vsCodeAvailable === null ? 'Checking VS Code…' : vsCodeAvailable ? 'Open folder in VS Code' : 'VS Code unavailable',
      disabled: vsCodeAvailable !== true,
      onClick: () => { void openVsCode(workspacePath).catch((cause) => { setVsCodeAvailable(false); showToast('error', messageOf(cause)) }) },
    },
  ], [showToast, vsCodeAvailable, workspacePath])

  const rightPanelVisible = activeRightWidget === 'terminal' || activeRightWidget === 'todo' || activeRightWidget === 'quotas'
    || (activeRightWidget === 'analysis' && sessionAnalysis !== null)
    || (activeRightWidget === 'git' && gitSnapshot?.repository === true)

  return (
    <div
      className={`app-shell ${rightPanelVisible ? 'right-sidebar-visible' : 'right-sidebar-collapsed'}`}
      style={{ '--right-sidebar-width': `${rightSidebarWidth}px` } as CSSProperties}
    >
      <WorkspaceSidebar
        recentSessions={recentSessions}
        sessions={sessions}
        selectedId={selectedId}
        selectedIndicator={selectedSession ? sessionIndicator(displayedActivity) : undefined}
        workspacePath={workspacePath}
        onChooseWorkspace={() => setDirectoryPickerOpen(true)}
        onCreate={() => startAndSelectSession(() => createSession(workspacePath))}
        onOpenSession={(recentSession) => startAndSelectSession(() => openSession(workspacePath, recentSession.sessionPath))}
        onSelectSession={setSelectedId}
        onError={(cause) => showToast('error', messageOf(cause))}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="workspace">
        {selectedSession && snapshotSessionId !== selectedSession.id ? (
          <>
            <section aria-busy="true" aria-live="polite" className="welcome session-loading">
              <span className="brand-mark large">π</span>
              <h1>Connecting to Pi…</h1>
              <p>Loading the session and its capabilities.</p>
              <span aria-hidden="true" className="session-loading-indicator" />
            </section>
            <ToastStack onDismiss={dismissToast} standalone toasts={visibleToasts} />
          </>
        ) : selectedSession ? (
          <>
            <Conversation activity={displayedActivity} agentName={selectedSession.activeAgent} darkMode={theme === 'dark'} detailedView={conversationView === 'detailed'} key={selectedSession.id} liveText={liveText} liveThinking={liveThinking} messages={snapshot.messages} navigationRequest={conversationNavigation} onError={handleConversationError} onStartSession={handleContextSessionStart} repositoryRoot={gitSnapshot?.root} scrollToBottomRequest={scrollToBottomRequest} toolExecutions={toolExecutions} workspacePath={workspacePath} />
            <button aria-label={`${conversationViewDetail.label}. ${conversationViewDetail.description}. Click to toggle view.`} className={`chat-detail-toggle ${conversationView}`} onClick={() => setConversationView((current) => {
                const next = current === 'simple' ? 'detailed' : 'simple'
                window.localStorage.setItem('pi-workbench.conversation-view', next)
                return next
              })} title={`${conversationViewDetail.label} — ${conversationViewDetail.description}`} type="button">
              <span aria-hidden="true" className="chat-detail-toggle-icon">⌘</span>
              <span className="chat-detail-toggle-copy"><strong>{conversationViewDetail.label}</strong><small>{conversationViewDetail.description}</small></span>
            </button>
            {questionnaire && <AskUserQuestionDialog key={String(questionnaire.request.id)} dialog={questionnaire} onClose={() => { setDialog(null); void refreshSessions() }} onError={(cause) => showToast('error', messageOf(cause))} />}
            <div className="composer-area">
              <ToastStack onDismiss={dismissToast} toasts={visibleToasts} />
              <Composer
              key={selectedSession.id}
              session={selectedSession}
              sessionIndicator={sessionIndicator(displayedActivity)}
              snapshot={snapshot}
              agentBusy={Boolean(agentBusy[selectedSession.id])}
              agentOptions={agentOptions[selectedSession.id] ?? emptyAgentOptions}
              selectedAgent={selectedSession.activeAgent ?? ''}
              onAgentChange={handleComposerAgentChange}
              onCommand={handleComposerCommand}
              commands={snapshot.commands}
              agentLoading={snapshotSessionId !== selectedSession.id}
              focusRequest={focusComposerRequest}
              draftRequest={composerDraftRequest?.sessionId === selectedSession.id ? composerDraftRequest : undefined}
              onDraftApplied={markComposerDraftApplied}
              showAgentSelector={snapshotSessionId !== selectedSession.id || snapshot.commands.some((command) => command.name === 'agent')}
              running={selectedSession.status === 'running'}
              onSend={handleComposerSend}
              onAbort={handleComposerAbort}
              onError={handleConversationError}
              requestedSelect={requestedSelect}
              onSelectOpened={handleComposerSelectOpened}
              submitRequest={submitRequest}
              />
            </div>
          </>
        ) : creatingSession ? (
          <>
            <section className="welcome" aria-busy="true">
              <span className="brand-mark large">π</span>
              <h1>Starting new session…</h1>
              <p>Initializing Pi and its agents.</p>
              <span aria-hidden="true" className="session-loading-indicator" />
            </section>
            <ToastStack onDismiss={dismissToast} standalone toasts={visibleToasts} />
          </>
        ) : (
          <>
            <section className="welcome">
              <span className="brand-mark large">π</span>
              <h1>Control Pi from your browser</h1>
              <p>Create a local session to access your models, agents, tools, and commands.</p>
            </section>
            <ToastStack onDismiss={dismissToast} standalone toasts={visibleToasts} />
          </>
        )}
      </main>

      <RightSidebar
        activeWidget={activeRightWidget}
        analysis={sessionAnalysis}
        currentQuotaProvider={currentQuotaProvider}
        onAnalysisNavigate={navigateToAnalysisTarget}
        onResize={updateRightSidebarWidth}
        snapshot={gitSnapshot?.repository ? gitSnapshot : null}
        quotas={quotas}
        width={rightSidebarWidth}
        workspacePath={workspacePath}
        railActions={railActions}
        onAction={async (message) => {
          const result = await commitAndPush(workspacePath, message)
          await refreshGit(workspacePath, true)
          if (result.pushError) showToast('error', `${result.committed ? 'Commit created, but' : 'Push'} failed: ${result.pushError}`)
          else showToast('notice', result.committed ? 'Commit created and pushed.' : 'Commits pushed.')
          return result
        }}
        onError={(cause) => showToast('error', messageOf(cause))}
        onFileSelect={(path, commitHash) => getGitFileDiff(workspacePath, path, commitHash)}
        onQuotaRefresh={() => refreshSessionQuotas(selectedId, false)}
        onRefresh={() => void refreshGit(workspacePath, true)}
        onRevert={async (hash) => {
          const result = await revertGitCommit(workspacePath, hash)
          await refreshGit(workspacePath, true)
          showToast('notice', `Commit ${hash.slice(0, 7)} revert.`)
          return result
        }}
        onTodoStartSession={(message) => startAndSelectSession(() => createSession(workspacePath), undefined, message)}
        onWidgetSelect={(widget) => setActiveRightWidget((current) => {
          const next = current === widget ? null : widget
          window.localStorage.setItem('pi-workbench.right-sidebar-widget', next ?? 'none')
          return next
        })}
      />

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

function readActiveRightWidget(): RightWidget | null {
  const stored = window.localStorage.getItem('pi-workbench.right-sidebar-widget')
  if (isRightWidget(stored)) return stored
  if (stored === 'none') return null
  return window.localStorage.getItem('pi-workbench.git-sidebar-collapsed') === 'true' ? null : 'git'
}

function isManagerEvent(value: unknown): value is ManagerEvent {
  return isObject(value) && value.kind === 'event' && typeof value.event === 'string' && typeof value.sessionId === 'string'
}

function lastUserTimestamp(messages: JsonObject[]): number | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && typeof message.timestamp === 'number') return message.timestamp
  }
  return undefined
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export default App
