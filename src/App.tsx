import { memo, useCallback, useEffect, useRef, useState, useTransition, type ClipboardEvent as ReactClipboardEvent, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import * as Select from '@radix-ui/react-select'
import ReactMarkdown from 'react-markdown'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import './App.css'
import { commitAndPush, createSession, getGitFileDiff, getGitSnapshot, getLaunchers, getSnapshot, getWorkspaceFile, listDirectories, listRecentSessions, listSessions, openLauncher, openSession, pickLauncher, revertGitCommit, selectLauncher, sendPiCommand } from './api.ts'
import type { GitActionResult, GitFileDiff, GitRevertResult, GitSnapshot, JsonObject, LauncherSnapshot, ManagerEvent, RecentSession, SessionSnapshot, SessionSummary, WorkspaceFile } from '../shared/types.ts'
import { askUserQuestionProtocol, parseAskUserQuestionRequest, type AskUserQuestionRequest } from '../shared/ask-user-question.ts'
import { activityForPiEvent, activityText, waitingActivity, type Activity } from './activity.ts'
import { canHighlightFile } from './file-preview.ts'
import { formatTurnCost, turnUsageByMessage, type MessageUsage } from './message-usage.ts'
import { directoryCompletionTarget } from './directory-completion.ts'
import { recentWorkspaces } from './recent-workspaces.ts'
import { clampGitSidebarWidth, maxGitSidebarWidth, minGitSidebarWidth, parseGitDiff, readGitSidebarWidth } from './git-sidebar.ts'
import { editOperations, formatToolCallTooltip, formatToolData, readContentDisplay, toolCallInUpdate, toolCallPresentation, toolCallsInMessage, toolContentText, toolFilePath, toolResultInMessage, type EditOperation, type ReadContentDisplay, type ToolResult } from './tool-calls.ts'

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

interface ToolExecution {
  id: string
  name: string
  args: unknown
  result?: ToolResult
}

interface FilePreview {
  path: string
  display: ReadContentDisplay
  file?: WorkspaceFile
  error?: string
  phase?: 'loading' | 'rendering'
}

const emptySnapshot: SessionSnapshot = { state: null, messages: [], models: [], commands: [], stats: null }
const maxComposerImages = 4
const maxComposerImageDimension = 1600
const maxComposerImageBytes = 350 * 1024

interface ComposerImage {
  id: string
  data: string
  mimeType: 'image/jpeg'
}

// Réduit chaque image collée sous la limite HTTP tout en préservant une résolution utile au modèle.
async function prepareComposerImage(file: File): Promise<ComposerImage | null> {
  const source = await loadImageSource(file)
  let width = Math.min(source.width, maxComposerImageDimension)
  let height = Math.round(source.height * (width / source.width))
  if (height > maxComposerImageDimension) {
    height = maxComposerImageDimension
    width = Math.round(source.width * (height / source.height))
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error("La compression d'image n'est pas disponible dans ce navigateur.")
  for (;;) {
    canvas.width = width
    canvas.height = height
    context.fillStyle = 'white'
    context.fillRect(0, 0, width, height)
    context.drawImage(source, 0, 0, width, height)
    for (const quality of [0.84, 0.72, 0.6, 0.5]) {
      const blob = await canvasToBlob(canvas, quality)
      if (blob.size <= maxComposerImageBytes) return { id: crypto.randomUUID(), data: await blobToBase64(blob), mimeType: 'image/jpeg' }
    }
    if (Math.max(width, height) <= 640) return null
    width = Math.round(width * 0.8)
    height = Math.round(height * 0.8)
  }
}

// Charge un fichier image dans un élément compatible Canvas et libère son URL temporaire dès le décodage.
function loadImageSource(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("L'image collée est illisible.")) }
    image.src = url
  })
}

// Encode le canvas en JPEG afin d'éviter que les captures PNG ne dépassent la limite de requête locale.
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("L'image n'a pas pu être compressée.")), 'image/jpeg', quality))
}

// Retire l'en-tête data URL, absent du format base64 attendu par le protocole RPC de Pi.
async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error("L'image n'a pas pu être lue."))
    reader.onerror = () => reject(reader.error ?? new Error("L'image n'a pas pu être lue."))
    reader.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('csharp', csharp)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('typescript', typescript)

// Orchestre l'état de l'espace de travail, les événements Pi et les panneaux de l'interface.
function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [workspacePath, setWorkspacePath] = useState(() => window.localStorage.getItem('pi-workbench.workspace-path') ?? '~/.pi')
  const [recentWorkspacePaths, setRecentWorkspacePaths] = useState(() => recentWorkspaces(window.localStorage.getItem('pi-workbench.workspace-path') ?? '~/.pi', readRecentWorkspaces()))
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false)
  const [launcherSnapshot, setLauncherSnapshot] = useState<LauncherSnapshot>({ launchers: [] })
  const [launchingWorkspace, setLaunchingWorkspace] = useState(false)
  const [openingSessionPath, setOpeningSessionPath] = useState('')
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
  const [toast, setToast] = useState<Toast | null>(null)
  const [gitSnapshot, setGitSnapshot] = useState<GitSnapshot | null>(null)
  const [activeRightWidget, setActiveRightWidget] = useState<'file' | 'git' | null>(() => window.localStorage.getItem('pi-workbench.git-sidebar-collapsed') === 'true' ? null : 'git')
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null)
  const [, startTransition] = useTransition()
  const [gitSidebarWidth, setGitSidebarWidth] = useState(() => readGitSidebarWidth(window.localStorage.getItem('pi-workbench.git-sidebar-width')))
  const selectedIdRef = useRef(selectedId)
  const fileRequestVersionRef = useRef(0)
  const refreshVersionRef = useRef(0)
  const gitRefreshVersionRef = useRef(0)
  const toastIdRef = useRef(0)
  const agentIntentsRef = useRef(new Map<string, AgentIntent>())
  selectedIdRef.current = selectedId

  const showToast = useCallback((kind: Toast['kind'], message: string) => {
    setToast({ id: ++toastIdRef.current, kind, message })
  }, [])

  const updateGitSidebarWidth = useCallback((width: number) => {
    const nextWidth = clampGitSidebarWidth(width)
    window.localStorage.setItem('pi-workbench.git-sidebar-width', String(nextWidth))
    setGitSidebarWidth(nextWidth)
  }, [])

  // Ouvre uniquement les Markdown dans le widget et délègue les documents HTML au navigateur local.
  const openWorkspaceFile = useCallback(async (path: string) => {
    const display = readContentDisplay({ path })
    if (display.kind === 'html') {
      const url = workspaceFileUrl(workspacePath, path)
      const tab = url ? window.open(url, '_blank') : null
      if (tab) tab.opener = null
      else showToast('error', "Le fichier HTML n'a pas pu être ouvert dans un nouvel onglet.")
      return
    }
    if (display.kind !== 'markdown') return

    const version = ++fileRequestVersionRef.current
    setActiveRightWidget('file')
    setFilePreview({ path, display, phase: 'loading' })
    try {
      const file = await getWorkspaceFile(workspacePath, path)
      if (version !== fileRequestVersionRef.current) return
      setFilePreview({ path: file.path, display: readContentDisplay({ path: file.path }), phase: 'rendering' })
      window.setTimeout(() => {
        if (version === fileRequestVersionRef.current) startTransition(() => setFilePreview({ path: file.path, display: readContentDisplay({ path: file.path }), file }))
      }, 0)
    } catch (cause) {
      if (version === fileRequestVersionRef.current) setFilePreview({ path, display, error: messageOf(cause) })
    }
  }, [showToast, startTransition, workspacePath])

  useEffect(() => {
    let cancelled = false
    void getLaunchers(workspacePath)
      .then((nextSnapshot) => {
        if (!cancelled) setLauncherSnapshot(nextSnapshot)
      })
      .catch((cause) => {
        if (!cancelled) showToast('error', messageOf(cause))
      })
    return () => { cancelled = true }
  }, [showToast, workspacePath])

  // Ouvre le choix mémorisé ou laisse Windows demander un exécutable lors de la première utilisation.
  const openWorkspaceInLauncher = useCallback(async () => {
    setLaunchingWorkspace(true)
    try {
      setLauncherSnapshot(await openLauncher(workspacePath))
    } catch (cause) {
      showToast('error', messageOf(cause))
    } finally {
      setLaunchingWorkspace(false)
    }
  }, [showToast, workspacePath])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => {
      setToast((current) => current?.id === toast.id ? null : current)
    }, toast.kind === 'error' ? 6000 : 4000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  // Recharge les sessions et leurs demandes UI en ignorant les réponses obsolètes.
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

  // Actualise l'état Git du dossier courant sans afficher les erreurs des rafraîchissements silencieux.
  const refreshGit = useCallback(async (cwd = workspacePath, notifyOnError = false) => {
    const version = ++gitRefreshVersionRef.current
    try {
      const nextSnapshot = await getGitSnapshot(cwd)
      if (version === gitRefreshVersionRef.current) setGitSnapshot(nextSnapshot)
    } catch (cause) {
      if (notifyOnError && version === gitRefreshVersionRef.current) showToast('error', messageOf(cause))
    }
  }, [showToast, workspacePath])

  // Synchronise l'instantané de session et efface le texte diffusé lorsqu'un tour est terminé.
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

  // Demande la sélection d'un agent en évitant les requêtes concurrentes pour une session.
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

    // Traduit les événements reçus en mises à jour d'interface et en réponses UI éventuelles.
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
      }

      // Remplace une exécution existante afin de conserver un seul état par appel d'outil.
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

  const rightSidebarVisible = Boolean(gitSnapshot?.repository) || activeRightWidget === 'file'

  return (
    <div
      className={`app-shell${rightSidebarVisible ? activeRightWidget ? ' git-sidebar-visible' : ' git-sidebar-collapsed' : ''}`}
      style={{ '--git-sidebar-width': `${gitSidebarWidth}px` } as CSSProperties}
    >
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">π</span>
          <div><strong>Pi Workbench</strong><small>Local workspace</small></div>
        </div>
        <div className="workspace-actions">
          <button className="workspace-path" onClick={() => setDirectoryPickerOpen(true)} title={workspacePath} type="button">
            <span>Dossier courant</span><strong>{workspacePath}</strong>
          </button>
          <LauncherControl
            launching={launchingWorkspace}
            onOpen={() => void openWorkspaceInLauncher()}
            onPick={() => void pickLauncher(workspacePath).then(setLauncherSnapshot).catch((cause) => showToast('error', messageOf(cause)))}
            onSelect={(launcherId) => void selectLauncher(workspacePath, launcherId).then(setLauncherSnapshot).catch((cause) => showToast('error', messageOf(cause)))}
            snapshot={launcherSnapshot}
          />
        </div>
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
                {activeSession?.status === 'running' && <span className="status-dot" aria-label="Agent en cours de travail" role="img" />}
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
            <Conversation activity={activity} agentName={selectedSession.activeAgent} detailedView={detailedView} liveText={liveText} messages={snapshot.messages} onFileOpen={openWorkspaceFile} repositoryRoot={gitSnapshot?.root} toolExecutions={toolExecutions} workspacePath={workspacePath} />
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
              showAgentSelector={snapshotSessionId !== selectedSession.id || snapshot.commands.some((command) => command.name === 'agent')}
              running={selectedSession.status === 'running'}
              detailedView={detailedView}
              onDetailedViewChange={() => setDetailedView((current) => {
                const next = !current
                window.localStorage.setItem('pi-workbench.detailed-view', String(next))
                return next
              })}
              onSend={async (message, images, behavior) => {
                const command: JsonObject = { type: 'prompt', message, images }
                if (selectedSession.status === 'running') command.streamingBehavior = behavior
                await sendPiCommand(selectedSession.id, command)
                await refreshSessions()
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

      {rightSidebarVisible && <RightSidebar
        activeWidget={activeRightWidget}
        filePreview={filePreview}
        onResize={updateGitSidebarWidth}
        snapshot={gitSnapshot?.repository ? gitSnapshot : null}
        width={gitSidebarWidth}
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
        onWidgetSelect={(widget) => setActiveRightWidget((current) => {
          const next = current === widget ? null : widget
          if (widget === 'git') window.localStorage.setItem('pi-workbench.git-sidebar-collapsed', String(next === null))
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
          setFilePreview(null)
          setActiveRightWidget(null)
          fileRequestVersionRef.current += 1
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

// Coordonne les panneaux Git et fichier, leur rail commun et le redimensionnement du panneau actif.
function RightSidebar({ activeWidget, filePreview, onResize, snapshot, width, onAction, onError, onFileSelect, onRefresh, onRevert, onWidgetSelect }: {
  activeWidget: 'file' | 'git' | null
  filePreview: FilePreview | null
  onResize: (width: number) => void
  snapshot: GitSnapshot | null
  width: number
  onAction: (message: string) => Promise<GitActionResult>
  onError: (cause: unknown) => void
  onFileSelect: (path: string, commitHash?: string) => Promise<GitFileDiff>
  onRefresh: () => void
  onRevert: (hash: string) => Promise<GitRevertResult>
  onWidgetSelect: (widget: 'file' | 'git') => void
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [fileDiff, setFileDiff] = useState<GitFileDiff | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const hasChanges = snapshot?.files.length ? snapshot.files.length > 0 : false
  const collapsed = activeWidget === null

  // Charge le diff demandé avant de remplacer la liste de fichiers du widget.
  async function selectFile(path: string, commitHash?: string): Promise<void> {
    setSelectedPath(path)
    try {
      setFileDiff(await onFileSelect(path, commitHash))
    } catch (cause) {
      setSelectedPath(null)
      onError(cause)
    }
  }

  // Exécute l'action Git demandée et conserve le message si elle échoue.
  async function action(): Promise<void> {
    setBusy(true)
    try {
      const result = await onAction(message)
      if (result.committed) setMessage('')
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  // Revert le commit choisi après confirmation et laisse Git signaler les éventuels conflits.
  async function revertCommit(hash: string): Promise<void> {
    if (!window.confirm(`Revert le commit ${hash.slice(0, 7)} ?`)) return
    setBusy(true)
    try {
      await onRevert(hash)
    } catch (cause) {
      onError(cause)
    } finally {
      setBusy(false)
    }
  }

  // Installe les écouteurs temporaires nécessaires au redimensionnement pointer du panneau.
  function startResize(event: ReactPointerEvent<HTMLDivElement>): void {
    const handle = event.currentTarget
    const initialX = event.clientX
    const initialWidth = width
    handle.setPointerCapture(event.pointerId)

    const resize = (moveEvent: PointerEvent): void => onResize(initialWidth + initialX - moveEvent.clientX)
    const stop = (): void => {
      handle.removeEventListener('pointermove', resize)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
      handle.removeEventListener('lostpointercapture', stop)
    }

    handle.addEventListener('pointermove', resize)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
    handle.addEventListener('lostpointercapture', stop)
  }

  function resizeWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const adjustment = event.key === 'ArrowLeft' ? 16 : event.key === 'ArrowRight' ? -16 : 0
    if (adjustment) {
      event.preventDefault()
      onResize(width + adjustment)
    }
    if (event.key === 'Home') {
      event.preventDefault()
      onResize(minGitSidebarWidth)
    }
    if (event.key === 'End') {
      event.preventDefault()
      onResize(maxGitSidebarWidth)
    }
  }

  return <aside className="git-sidebar" aria-label="Informations Git">
    {!collapsed && <div className="git-widget-panel">
      <div
        aria-controls={activeWidget === 'file' ? 'file-panel' : 'git-panel'}
        aria-label="Redimensionner le panneau latéral"
        aria-orientation="vertical"
        aria-valuemax={maxGitSidebarWidth}
        aria-valuemin={minGitSidebarWidth}
        aria-valuenow={width}
        className="git-resize-handle"
        onKeyDown={resizeWithKeyboard}
        onPointerDown={startResize}
        role="separator"
        tabIndex={0}
      />
      <section aria-label={activeWidget === 'file' ? 'Fichier' : fileDiff || selectedPath ? 'Diff Git' : 'Informations Git'} className="git-panel" id={activeWidget === 'file' ? 'file-panel' : 'git-panel'}>
        {activeWidget === 'file' ? <WidgetLayout header={<strong title={filePreview?.path}>{filePreview?.path}</strong>}><FilePreviewContent preview={filePreview} /></WidgetLayout> : snapshot && <WidgetLayout
          footer={activeWidget === 'git' && !selectedPath && (hasChanges || snapshot.ahead > 0) && <form className="git-actions" onSubmit={(event) => { event.preventDefault(); void action() }}>
            {hasChanges && <input aria-label="Message de commit" disabled={busy} onChange={(event) => setMessage(event.target.value)} placeholder="Message de commit" value={message} />}
            <button disabled={busy || (hasChanges && !message.trim())} type="submit">{busy ? 'Git en cours…' : hasChanges ? 'Committer et pousser' : `Pousser ${snapshot.ahead} commit${snapshot.ahead > 1 ? 's' : ''}`}</button>
          </form>}
          header={fileDiff || selectedPath ? <><button aria-label="Retour aux fichiers Git" className="git-back" onClick={() => { setFileDiff(null); setSelectedPath(null) }} title="Retour" type="button">←</button><strong title={selectedPath ?? undefined}>{selectedPath}</strong></> : <><div><strong>{snapshot.branch}</strong><span>{hasChanges ? `${snapshot.files.length} fichier${snapshot.files.length > 1 ? 's' : ''} modifié${snapshot.files.length > 1 ? 's' : ''}` : 'Arbre propre'}</span></div><button aria-label="Actualiser l’état Git" className="git-refresh" onClick={onRefresh} title="Actualiser" type="button">↻</button></>}
        >
          {fileDiff || selectedPath ? fileDiff ? <GitDiff diff={fileDiff.diff} /> : <p className="git-empty">Chargement du diff…</p> : <>
            {hasChanges && <ul className="git-file-list">
              {snapshot.files.map((file) => <li className="git-file-item" key={file.path}>
                {file.status === 'added' || file.status === 'modified' ? <button className="git-file-button" onClick={() => void selectFile(file.path)} type="button"><GitFileRow file={file} /></button> : <GitFileRow file={file} />}
              </li>)}
            </ul>}
            {snapshot.commits.length > 0 && <section className="git-commits" aria-label="Commits non poussés">
              <h2>Commits non poussés <small>{snapshot.commits.length}</small></h2>
              {snapshot.commits.map((commit) => <div className="git-commit" key={commit.hash}>
                <details>
                  <summary title={commit.subject}><code>{commit.hash.slice(0, 7)}</code><span>{commit.subject}</span></summary>
                  {commit.files.length > 0 ? <ul className="git-file-list git-commit-files">{commit.files.map((file) => <li className="git-file-item" key={file.path}>
                    {file.status === 'added' || file.status === 'modified' ? <button className="git-file-button" onClick={() => void selectFile(file.path, commit.hash)} type="button"><GitFileRow file={file} /></button> : <GitFileRow file={file} />}
                  </li>)}</ul> : <p className="git-empty">Aucun fichier modifié.</p>}
                </details>
                <button aria-label={`Revert le commit ${commit.hash.slice(0, 7)}`} className="git-revert" disabled={busy} onClick={() => void revertCommit(commit.hash)} title="Revert ce commit" type="button">↶</button>
              </div>)}
            </section>}
            {!hasChanges && snapshot.ahead === 0 && <p className="git-empty">Aucun changement à committer.</p>}
          </>}
        </WidgetLayout>}
      </section>
    </div>}
    <div className="git-rail">
      {snapshot && <button
        aria-controls={activeWidget === 'git' ? 'git-panel' : undefined}
        aria-expanded={activeWidget === 'git'}
        aria-label={activeWidget === 'git' ? 'Réduire le panneau Git' : 'Développer le panneau Git'}
        className="rail-tab"
        onClick={() => onWidgetSelect('git')}
        title="Git"
        type="button"
      >
        <span aria-hidden="true">⎇</span>
        {(hasChanges || snapshot.ahead > 0) && <small>{snapshot.files.length + snapshot.ahead}</small>}
      </button>}
      <button
        aria-controls={activeWidget === 'file' ? 'file-panel' : undefined}
        aria-expanded={activeWidget === 'file'}
        aria-label={activeWidget === 'file' ? 'Réduire le panneau Markdown' : 'Développer le panneau Markdown'}
        className="rail-tab"
        disabled={!filePreview}
        onClick={() => onWidgetSelect('file')}
        title="Markdown"
        type="button"
      ><span aria-hidden="true">¶</span></button>
    </div>
  </aside>
}

// Garantit une structure stable : en-tête et actions fixes, contenu seul défilant.
function WidgetLayout({ children, footer, header }: { children: ReactNode; footer?: ReactNode | false; header: ReactNode }) {
  return <>
    <header className="widget-header">{header}</header>
    <div className="widget-content">{children}</div>
    {footer && <footer className="widget-footer">{footer}</footer>}
  </>
}

// Affiche le contenu Markdown relu depuis le disque.
function FilePreviewContent({ preview }: { preview: FilePreview | null }) {
  if (!preview) return <p className="git-empty">Choisissez un appel read ou write sur un fichier Markdown.</p>
  if (preview.error) return <p className="file-preview-error" role="alert">{preview.error}</p>
  if (!preview.file) return <p className="git-empty" role="status"><span aria-hidden="true" className="spinner" />{preview.phase === 'rendering' ? 'Colorisation du fichier…' : 'Chargement du fichier…'}</p>

  return <section className="file-preview file-preview-markdown"><Markdown>{preview.file.content}</Markdown></section>
}

// Affiche les métadonnées communes d'un fichier dans les listes Git.
function GitFileRow({ file }: { file: GitSnapshot['files'][number] }) {
  return <>
    <span className={`git-file-status ${file.status}`} title={gitStatusLabel(file.status)}>{gitStatusInitial(file.status)}</span>
    <span className="git-file-path" title={file.path}>{file.path}</span>
    <span className="git-file-counts"><b>+{file.additions ?? '—'}</b><i>−{file.deletions ?? '—'}</i></span>
  </>
}

// Affiche un diff Git avec les numéros de lignes avant et après la modification.
function GitDiff({ diff }: { diff: string }) {
  const lines = parseGitDiff(diff)
  if (lines.length === 0) return <p className="git-empty">Aucune différence textuelle à afficher.</p>

  return <section className="git-diff" aria-label="Diff du fichier">
    {lines.map((line, index) => <div className={`git-diff-line ${line.kind}`} key={index}>
      <span>{line.oldLine ?? ''}</span>
      <span>{line.newLine ?? ''}</span>
      <i aria-hidden="true">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</i>
      <code>{line.content}</code>
    </div>)}
  </section>
}

function gitStatusLabel(status: 'added' | 'deleted' | 'modified' | 'renamed'): string {
  return { added: 'Ajouté', deleted: 'Supprimé', modified: 'Modifié', renamed: 'Renommé' }[status]
}

function gitStatusInitial(status: 'added' | 'deleted' | 'modified' | 'renamed'): string {
  return { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' }[status]
}

// Lit une éventuelle ancienne liste invalide sans empêcher l'ouverture de l'application.
function readRecentWorkspaces(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem('pi-workbench.recent-workspace-paths') ?? '[]')
    return Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string') : []
  } catch {
    return []
  }
}

// Réunit l'ouverture immédiate et le choix explicite sans afficher une configuration permanente dans la sidebar.
function LauncherControl({ launching, onOpen, onPick, onSelect, snapshot }: {
  launching: boolean
  onOpen: () => void
  onPick: () => void
  onSelect: (launcherId: string) => void
  snapshot: LauncherSnapshot
}) {
  const selected = snapshot.launchers.find(({ id }) => id === snapshot.selectedLauncherId)
  const label = selected ? `Ouvrir le dossier dans ${selected.name}` : 'Choisir un éditeur Windows et ouvrir le dossier'

  const menuId = 'launcher-menu'

  function closeMenu(): void {
    const menu = document.getElementById(menuId)
    if (menu instanceof HTMLElement) menu.hidePopover()
  }

  return <div className="launcher-control">
    <button aria-label={label} className="launcher-open" disabled={launching} onClick={onOpen} title={label} type="button">
      <LauncherIcon launcher={selected} /><span>{selected?.name ?? 'Ouvrir dans un IDE'}</span>
    </button>
    <button aria-label="Choisir un IDE" className="launcher-select-trigger" disabled={launching} popoverTarget={menuId} title="Choisir un IDE" type="button">
      IDE
    </button>
    <div aria-label="Éditeurs configurés" className="launcher-menu" id={menuId} popover="auto">
      {snapshot.launchers.map((launcher) => <button aria-current={launcher.id === snapshot.selectedLauncherId ? 'true' : undefined} className="launcher-menu-item" key={launcher.id} onClick={() => { closeMenu(); onSelect(launcher.id) }} type="button">
        <LauncherIcon launcher={launcher} /><span>{launcher.name}</span>{launcher.id === snapshot.selectedLauncherId && <span aria-hidden="true">✓</span>}
      </button>)}
      {snapshot.launchers.length > 0 && <div className="launcher-menu-separator" />}
      <button className="launcher-menu-item launcher-menu-pick" onClick={() => { closeMenu(); onPick() }} type="button">Choisir un autre IDE…</button>
    </div>
  </div>
}

function LauncherIcon({ launcher }: { launcher?: LauncherSnapshot['launchers'][number] }) {
  if (launcher?.iconDataUrl) return <img alt="" aria-hidden="true" className="launcher-icon" src={launcher.iconDataUrl} />
  return <svg aria-hidden="true" className="launcher-fallback-icon" viewBox="0 0 24 24"><path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" /></svg>
}

// Permet de compléter puis valider un chemin local avant de changer l'espace de travail.
function DirectoryPicker({ initialPath, recentPaths, onClose, onError, onSelect }: {
  initialPath: string
  recentPaths: string[]
  onClose: () => void
  onError: (cause: unknown) => void
  onSelect: (path: string) => void
}) {
  const [path, setPath] = useState(initialPath)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const completionVersionRef = useRef(0)

  // Les requêtes obsolètes ne doivent pas remplacer les suggestions du chemin actuellement saisi.
  useEffect(() => {
    const version = ++completionVersionRef.current
    const target = directoryCompletionTarget(path)
    if (!target) {
      setSuggestions([])
      return
    }

    void listDirectories(target.parentPath).then((parent) => {
      if (version !== completionVersionRef.current) return
      setSuggestions(parent.directories
        .filter((directory) => directory.name.startsWith(target.namePrefix))
        .map((directory) => `${target.pathPrefix}${directory.name}`)
        .filter((completion) => completion !== path.trim()))
      setActiveSuggestion(-1)
    }).catch(() => {
      if (version === completionVersionRef.current) setSuggestions([])
    })
  }, [path])

  // Valide que le chemin est toujours accessible avant de l'adopter comme workspace.
  function selectDirectory(nextPath: string): void {
    void listDirectories(nextPath).then((directory) => onSelect(directory.path)).catch(onError)
  }

  // Applique les raccourcis habituels d'une liste de complétion sans intercepter la saisie normale.
  function handlePathKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return
      event.preventDefault()
      setActiveSuggestion((current) => event.key === 'ArrowDown'
        ? Math.min(current + 1, suggestions.length - 1)
        : Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Tab') {
      const suggestion = suggestions[activeSuggestion >= 0 ? activeSuggestion : 0]
      if (!suggestion) return
      event.preventDefault()
      setPath(suggestion)
      setActiveSuggestion(-1)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      selectDirectory(path)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="directory-picker-title" aria-modal="true" className="modal directory-picker" role="dialog">
        <h2 id="directory-picker-title">Choisir un dossier</h2>
        {recentPaths.length > 0 && <section aria-label="Workspaces récents" className="recent-workspaces">
          <strong>Workspaces récents</strong>
          <div>{recentPaths.map((recentPath) => <button key={recentPath} onClick={() => selectDirectory(recentPath)} type="button">{recentPath}</button>)}</div>
        </section>}
        <label className="directory-path-label" htmlFor="directory-path">Chemin du dossier</label>
        <input
          aria-activedescendant={activeSuggestion >= 0 ? `directory-suggestion-${activeSuggestion}` : undefined}
          autoFocus
          aria-autocomplete="list"
          aria-controls={suggestions.length > 0 ? 'directory-suggestions' : undefined}
          aria-expanded={suggestions.length > 0}
          className="directory-path-input"
          id="directory-path"
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={handlePathKeyDown}
          placeholder="~/projets ou /chemin/absolu"
          role="combobox"
          value={path}
        />
        <p className="directory-path-hint">Tab complète · ↑↓ parcourent · Entrée valide · Échap annule</p>
        {suggestions.length > 0 && <div aria-label="Suggestions de dossiers" className="directory-suggestions" id="directory-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => <div
            aria-selected={index === activeSuggestion}
            className={index === activeSuggestion ? 'active' : undefined}
            id={`directory-suggestion-${index}`}
            key={suggestion}
            onClick={() => { setPath(suggestion); setActiveSuggestion(-1) }}
            onMouseDown={(event) => event.preventDefault()}
            role="option"
          >{suggestion}</div>)}
        </div>}
        <div className="modal-actions"><button onClick={onClose} type="button">Annuler</button></div>
      </section>
    </div>
  )
}

// Encapsule l'état occupé et la gestion d'erreur du démarrage d'une session.
function NewSessionButton({ onCreate, onError }: { onCreate: () => Promise<void>; onError: (cause: unknown) => void }) {
  const [busy, setBusy] = useState(false)

  // Empêche les doubles démarrages et transmet les erreurs au conteneur de notifications.
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

// Assemble l'historique, le flux en cours et les exécutions d'outils selon le niveau de détail choisi.
function Conversation({ messages, liveText, activity, agentName, detailedView, onFileOpen, repositoryRoot, toolExecutions, workspacePath }: {
  messages: JsonObject[]
  liveText: string
  activity: Activity | null
  agentName?: string
  detailedView: boolean
  onFileOpen: (path: string) => void
  repositoryRoot?: string | null
  toolExecutions: ToolExecution[]
  workspacePath: string
}) {
  const visibleMessages = messages.filter(isVisibleConversationMessage)
  const usagesByMessage = turnUsageByMessage(messages)
  const toolCalls = messages.flatMap(toolCallsInMessage)
  const toolCallIds = new Set(toolCalls.map((call) => call.id))
  const resultsByCallId = new Map(messages.flatMap((message) => {
    const result = toolResultInMessage(message)
    return result ? [[result.toolCallId, result] as const] : []
  }))
  const executionsByCallId = new Map(toolExecutions.map((execution) => [execution.id, execution]))
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    endRef.current?.scrollIntoView({ behavior })
  }, [visibleMessages.length, liveText, activity, toolExecutions])

  return (
    <section className="conversation" aria-live="polite">
      {messages.map((message, index) => {
        const calls = detailedView ? toolCallsInMessage(message) : []
        if (!isVisibleConversationMessage(message) && calls.length === 0) return null
        return <div key={`${String(message.timestamp ?? '')}-${index}`}>
          {isVisibleConversationMessage(message) && <MessageCard message={message} usage={usagesByMessage.get(index)} />}
          {calls.map((call) => {
            const result = resultsByCallId.get(call.id) ?? executionsByCallId.get(call.id)?.result
            return <ToolCallCard args={call.args} hasResult={result !== undefined} id={call.id} key={call.id} name={call.name} onFileOpen={onFileOpen} repositoryRoot={repositoryRoot} resultContent={result?.content} resultError={result?.isError} workspacePath={workspacePath} />
          })}
        </div>
      })}
      {detailedView && toolExecutions.filter((execution) => !toolCallIds.has(execution.id)).map((execution) => <ToolCallCard args={execution.args} hasResult={execution.result !== undefined} id={execution.id} key={execution.id} name={execution.name} onFileOpen={onFileOpen} repositoryRoot={repositoryRoot} resultContent={execution.result?.content} resultError={execution.result?.isError} workspacePath={workspacePath} />)}
      {liveText && <article className="message assistant streaming"><div className="content"><Markdown>{liveText}</Markdown></div></article>}
      {activity && activity.kind !== 'writing' && <ActivityIndicator activity={activity} agentName={agentName} />}
      {visibleMessages.length === 0 && !liveText && !activity && <div className="empty-conversation"><h2>Session prête</h2><p>Envoyez un message ou utilisez une commande de votre installation Pi.</p></div>}
      <div ref={endRef} />
    </section>
  )
}

// Regroupe l'appel et son résultat afin que leur état visuel reste cohérent dans l'historique.
const ToolCallCard = memo(function ToolCallCard({ args, hasResult, id, name, onFileOpen, repositoryRoot, resultContent, resultError, workspacePath }: {
  args: unknown
  hasResult: boolean
  id: string
  name: string
  onFileOpen: (path: string) => void
  repositoryRoot?: string | null
  resultContent?: unknown
  resultError?: boolean
  workspacePath: string
}) {
  const pending = !hasResult
  const [expanded, setExpanded] = useState(false)
  const [writtenContent, setWrittenContent] = useState<string>()
  const [writtenContentError, setWrittenContentError] = useState<string>()
  const [loadingWrittenContent, setLoadingWrittenContent] = useState(false)
  const [codeRendered, setCodeRendered] = useState(false)
  const input = formatToolData(args)
  const output = hasResult ? toolContentText(resultContent) : ''
  const displayedOutput = output || 'Aucune sortie.'
  const presentation = toolCallPresentation({ id, name, args }, repositoryRoot)
  const tooltip = formatToolCallTooltip(presentation.headerDetail?.title ?? input, input, hasResult ? displayedOutput : undefined)
  const filePath = name === 'read' || name === 'write' ? toolFilePath(args) : null
  const display = filePath ? readContentDisplay({ path: filePath }) : { kind: 'text' as const }
  const specialFile = display.kind === 'markdown' || display.kind === 'html'
  const codeContent = name === 'write' ? writtenContent : displayedOutput
  const toggleExpanded = () => setExpanded((isExpanded) => !isExpanded)

  useEffect(() => {
    if (!expanded || display.kind !== 'code' || loadingWrittenContent || writtenContentError || codeRendered) return
    const timeout = window.setTimeout(() => setCodeRendered(true), 0)
    return () => window.clearTimeout(timeout)
  }, [codeRendered, display.kind, expanded, loadingWrittenContent, writtenContentError])

  const activate = () => {
    if (filePath && specialFile) {
      onFileOpen(filePath)
      return
    }
    if (filePath && display.kind === 'code' && name === 'write' && writtenContent === undefined) {
      setExpanded(true)
      setLoadingWrittenContent(true)
      setWrittenContentError(undefined)
      void getWorkspaceFile(workspacePath, filePath).then((file) => setWrittenContent(file.content)).catch((cause: unknown) => setWrittenContentError(messageOf(cause))).finally(() => setLoadingWrittenContent(false))
      return
    }
    toggleExpanded()
  }

  const content = writtenContentError ?? codeContent ?? displayedOutput
  const contentError = resultError || Boolean(writtenContentError)
  const renderingCode = display.kind === 'code' && canHighlightFile(content) && expanded && !loadingWrittenContent && !writtenContentError && !codeRendered
  return <article className={`tool-call${contentError ? ' error' : ''}`}>
    <button aria-expanded={specialFile ? undefined : hasResult ? expanded : undefined} className="tool-call-heading tool-call-tooltip" data-tooltip={tooltip} disabled={!hasResult} onClick={activate} type="button">
      <span aria-hidden="true">⌘</span>
      <span><strong aria-label={tooltip}>{name}</strong></span>
      {presentation.headerDetail && <span className="tool-call-command"><code aria-label={`Commande complète : ${presentation.headerDetail.title}`}>{presentation.headerDetail.text}</code></span>}
      {presentation.headerDetail?.suffix && <span className="tool-call-range"><code aria-label={`Plage lue : ${presentation.headerDetail.suffix}`}>{presentation.headerDetail.suffix}</code></span>}
      <small>
        {pending && <span aria-label="Outil en cours" className="spinner tool-call-spinner" role="status" />}
        {hasResult ? contentError ? 'Échec' : 'Terminé' : 'En cours…'}
        {pending && presentation.pendingDetail && ` · ${presentation.pendingDetail}`}
      </small>
    </button>
    {hasResult && !specialFile && expanded && <ToolCallContent call={{ name, args }} content={content} error={contentError} onCollapse={() => setExpanded(false)} renderingCode={renderingCode || loadingWrittenContent} />}
  </article>
})

// Affiche la sortie complète lorsque son appel a été développé et referme le bloc à son clic.
function ToolCallContent({ call, content, error, onCollapse, renderingCode }: { call: { name: string; args: unknown }; content: string; error?: boolean; onCollapse: () => void; renderingCode: boolean }) {
  if (renderingCode) return <section className="tool-call-content tool-call-loading" role="status" onClick={onCollapse}><span aria-hidden="true" className="spinner" />Colorisation du fichier…</section>

  const edits = call.name === 'edit' && !error ? editOperations(call.args) : null
  if (edits) return <section className="tool-call-content" onClick={onCollapse}><ToolEditDiff edits={edits} /></section>

  const display = call.name === 'read' || call.name === 'write' ? readContentDisplay(call.args) : { kind: 'text' as const }
  if (display.kind === 'markdown') return <section className="tool-call-content tool-call-markdown" onClick={onCollapse}><Markdown>{content}</Markdown></section>
  if (display.kind === 'code' && canHighlightFile(content)) return <section className="tool-call-content" onClick={onCollapse}><SyntaxHighlighter className="tool-call-syntax" customStyle={{ background: 'transparent', margin: 0, padding: '9px 10px' }} language={display.language} PreTag="div" style={oneLight} wrapLongLines>{content}</SyntaxHighlighter></section>
  if (display.kind === 'code') return <section className="tool-call-content" onClick={onCollapse}><p className="tool-call-notice">Colorisation désactivée au-delà de 50 000 caractères.</p><pre>{content}</pre></section>
  return <section className="tool-call-content" onClick={onCollapse}><pre>{content}</pre></section>
}

// Affiche chaque remplacement exact sous la forme compacte d'un diff unifié.
function ToolEditDiff({ edits }: { edits: EditOperation[] }) {
  return <section className="tool-call-content tool-edit-diff">
    {edits.map((edit, index) => <div aria-label={`Édition ${index + 1}`} className="tool-edit-operation" key={index}>
      {diffLines(edit.oldText).map((line, lineIndex) => <div className="tool-edit-line removed" key={`removed-${lineIndex}`}><span aria-hidden="true">−</span><code>{line}</code></div>)}
      {diffLines(edit.newText).map((line, lineIndex) => <div className="tool-edit-line added" key={`added-${lineIndex}`}><span aria-hidden="true">+</span><code>{line}</code></div>)}
    </div>)}
  </section>
}

function diffLines(text: string): string[] {
  return text === '' ? [] : text.split('\n')
}

const MessageCard = memo(function MessageCard({ message, usage }: { message: JsonObject; usage?: MessageUsage }) {
  const role = String(message.role)
  const timestamp = typeof message.timestamp === 'number' ? new Date(message.timestamp) : null
  const time = timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null
  return <article className={`message ${role}`}><div className="content">{renderContent(message.content ?? message.output)}</div>{usage && <TurnUsage usage={usage} />}{role === 'user' && time && <time className="message-time" dateTime={time.toISOString()}>{time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>}</article>
})

// Affiche les compteurs facturés par Pi pour une réponse assistant terminée.
function TurnUsage({ usage }: { usage: MessageUsage }) {
  return <dl className="turn-usage">
    <div><dt>Coût</dt><dd>{formatTurnCost(usage.cost)}</dd></div>
    <div><dt>Cache read</dt><dd>{formatTokens(usage.cacheRead)}</dd></div>
    <div><dt>Cache miss</dt><dd>{formatTokens(usage.cacheMiss)}</dd></div>
    <div><dt>Output</dt><dd>{formatTokens(usage.output)}</dd></div>
  </dl>
}

function ActivityIndicator({ activity, agentName }: { activity: Activity; agentName?: string }) {
  return <div className="pi-activity" role="status"><span aria-hidden="true" className="spinner" /><span className="activity-text">{activityText(activity, agentName)}</span></div>
}

function isVisibleConversationMessage(message: JsonObject): boolean {
  const role = message.role
  return (role === 'user' || role === 'assistant') && hasVisibleContent(message.content ?? message.output)
}

function hasVisibleContent(content: unknown): boolean {
  if (typeof content === 'string') return content.trim().length > 0
  return Array.isArray(content) && content.some((part) => isObject(part) && (
    (part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0)
    || isImageContent(part)
  ))
}

function renderContent(content: unknown): ReactNode {
  if (typeof content === 'string') return <Markdown>{content}</Markdown>
  if (!Array.isArray(content)) return null
  const images = content.filter(isImageContent)
  const text = content.filter((part): part is JsonObject => isObject(part) && part.type === 'text' && typeof part.text === 'string')
  return <>{images.map((image, index) => <img alt={`Image jointe ${index + 1}`} className="message-image" key={`image-${index}`} src={`data:${image.mimeType};base64,${image.data}`} />)}{text.map((part, index) => <Markdown key={`text-${index}`}>{String(part.text)}</Markdown>)}</>
}

function isImageContent(value: unknown): value is JsonObject & { data: string; mimeType: string } {
  return isObject(value) && value.type === 'image' && typeof value.data === 'string' && typeof value.mimeType === 'string' && /^image\/(?:gif|jpeg|png|webp)$/.test(value.mimeType)
}

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown>{children}</ReactMarkdown>
}

// Fournit la saisie utilisateur et les commandes de session tout en reflétant l'état Pi courant.
function Composer({ session, snapshot, agentBusy, agentOptions, selectedAgent, agentLoading, showAgentSelector, onAgentChange, onCommand, commands, running, detailedView, onDetailedViewChange, onSend, onAbort, onError }: {
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
  detailedView: boolean
  onDetailedViewChange: () => void
  onSend: (message: string, images: JsonObject[], behavior: 'steer' | 'followUp') => Promise<void>
  onAbort: () => Promise<JsonObject>
  onError: (cause: unknown) => void
}) {
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<ComposerImage[]>([])
  const [preparingImages, setPreparingImages] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [behavior, setBehavior] = useState<'steer' | 'followUp'>('steer')
  const model = isObject(snapshot.state?.model) ? snapshot.state.model : null
  const currentModel = model && typeof model.id === 'string' && typeof model.provider === 'string' ? `${model.provider}/${model.id}` : ''
  const selectedModel = snapshot.models.find((item) => `${item.provider}/${item.id}` === currentModel)
  const modelInput = selectedModel?.input ?? model?.input
  const supportsImages = Array.isArray(modelInput) && modelInput.includes('image')
  const thinking = typeof snapshot.state?.thinkingLevel === 'string' ? snapshot.state.thinkingLevel : 'off'

  // Envoie texte et images dans la même commande RPC, puis restaure le brouillon en cas d'échec.
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

  // Prépare localement les images collées pour borner le corps HTTP et le contexte envoyé au modèle.
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

  return (
    <form className="composer" onSubmit={(event) => void submit(event)}>
      {images.length > 0 && <div aria-label="Images à envoyer" className="composer-images">
        {images.map((image, index) => <div className="composer-image" key={image.id}>
          <img alt={`Image ${index + 1} à envoyer`} src={`data:${image.mimeType};base64,${image.data}`} />
          <button aria-label={`Retirer l'image ${index + 1}`} disabled={submitting} onClick={() => setImages((current) => current.filter(({ id }) => id !== image.id))} type="button">×</button>
        </div>)}
      </div>}
      <textarea aria-label="Message" disabled={submitting} onPaste={(event) => void handlePaste(event)} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
      }} placeholder="Demandez quelque chose à Pi…" rows={3} />
      <div className="composer-footer">
        <div className="composer-actions">
          <div className="composer-tools">
            {showAgentSelector && <ComposerSelect
              ariaLabel="Agent"
              disabled={agentLoading || agentBusy || agentOptions.length === 0}
              onValueChange={onAgentChange}
              options={agentOptions.map((agent) => ({ label: capitalizeLabel(agent), value: agent }))}
              placeholder={agentLoading || agentBusy ? 'Chargement…' : 'Choisir un agent'}
              tone="agent"
              value={selectedAgent}
            />}
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
              options={['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) => ({ label: capitalizeLabel(level), value: level }))}
              tone="thinking"
              value={thinking}
            />
            {commands.length > 0 && <ComposerSelect
              ariaLabel="Insérer une commande Pi"
              onValueChange={(value) => setMessage(`/${value} `)}
              options={commands.map((command) => ({ label: String(command.name), value: String(command.name) }))}
              placeholder="Commandes"
              tone="command"
              value=""
            />}
            <button aria-pressed={detailedView} className={`composer-toggle${detailedView ? ' active' : ''}`} onClick={onDetailedViewChange} type="button">
              <span aria-hidden="true">⌘</span> {detailedView ? 'Vue détaillée' : 'Vue simplifiée'}
            </button>
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
          <div className="composer-stats"><span><b>Coût</b>{cost}</span><span><b>Contexte</b>{contextPercent}<small>{contextTokens}</small></span></div>
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

// Présente une question à la fois et conserve les réponses jusqu'à leur envoi groupé à Pi.
function AskUserQuestionDialog({ dialog, onClose, onError }: { dialog: UiDialog; onClose: () => void; onError: (cause: unknown) => void }) {
  const request = parseQuestionnaire(dialog.request)
  const [selectedOptions, setSelectedOptions] = useState<string[][]>(() => request.questions.map(() => []))
  const [freeText, setFreeText] = useState<string[]>(() => request.questions.map(() => ''))
  const [activeQuestion, setActiveQuestion] = useState(0)
  const question = request.questions[activeQuestion]

  function isAnswered(index: number): boolean {
    return selectedOptions[index].length > 0 || (!request.questions[index].multiSelect && freeText[index].trim().length > 0)
  }

  // Applique les règles de sélection et avance après un choix unique nouvellement sélectionné.
  function toggle(questionIndex: number, option: string): void {
    const wasSelected = selectedOptions[questionIndex].includes(option)
    setSelectedOptions((current) => current.map((selected, index) => {
      if (index !== questionIndex) return selected
      if (request.questions[index].multiSelect) return selected.includes(option) ? selected.filter((value) => value !== option) : [...selected, option]
      return selected[0] === option ? [] : [option]
    }))
    if (!question.multiSelect && !wasSelected && questionIndex < request.questions.length - 1) setActiveQuestion(questionIndex + 1)
  }

  // Sérialise la réponse du questionnaire et la transmet à la session en cours.
  async function respond(cancelled: boolean): Promise<void> {
    try {
      const value = cancelled
        ? { answers: [], cancelled: true }
        : {
            cancelled: false,
            answers: request.questions.map((item, index) => ({
              question: item.question,
              selectedOptions: selectedOptions[index],
              ...(freeText[index].trim() ? { text: freeText[index] } : {}),
            })),
          }
      await sendPiCommand(dialog.sessionId, { type: 'extension_ui_response', id: dialog.request.id, value: JSON.stringify(value) })
      onClose()
    } catch (cause) { onError(cause) }
  }

  const complete = request.questions.every((_, index) => isAnswered(index))
  const lastQuestion = activeQuestion === request.questions.length - 1

  return (
    <section aria-labelledby="ask-user-question-title" className="ask-user-question" role="dialog">
      <div className="ask-user-question-heading">
        <span>Pi attend votre réponse</span>
        <strong id="ask-user-question-title">Question {activeQuestion + 1} sur {request.questions.length}</strong>
      </div>
      <nav aria-label="Questions du questionnaire" className="ask-user-question-tabs">
        {request.questions.map((item, index) => <button aria-current={index === activeQuestion ? 'step' : undefined} className={index === activeQuestion ? 'active' : isAnswered(index) ? 'answered' : ''} key={`${item.question}-${index}`} onClick={() => setActiveQuestion(index)} type="button">
          <span>Question {index + 1}</span>
          {isAnswered(index) && <b aria-label="Répondue">✓</b>}
        </button>)}
      </nav>
      <div className="ask-user-question-list">
        <fieldset>
          <legend><span>{question.header}</span>{question.question}</legend>
          <p className="ask-user-question-hint">{question.multiSelect ? 'Plusieurs réponses possibles' : 'Choisissez une réponse ou écrivez la vôtre'}</p>
          <div className="ask-user-options">
            {question.options.map((option) => {
              const selected = selectedOptions[activeQuestion].includes(option.label)
              return <button aria-pressed={selected} className={selected ? 'selected' : ''} key={option.label} onClick={() => toggle(activeQuestion, option.label)} type="button">
                <span aria-hidden="true" className="ask-user-option-mark">{selected ? '✓' : ''}</span>
                <span><strong>{option.label}</strong><small>{option.description}</small></span>
              </button>
            })}
          </div>
          {!question.multiSelect && <textarea aria-label={`Réponse libre : ${question.question}`} onChange={(event) => setFreeText((current) => current.map((text, index) => index === activeQuestion ? event.target.value : text))} placeholder="Ou saisissez votre propre réponse…" rows={2} value={freeText[activeQuestion]} />}
        </fieldset>
      </div>
      <div className="ask-user-question-actions">
        <button onClick={() => void respond(true)} type="button">Annuler</button>
        <div>
          {activeQuestion > 0 && <button onClick={() => setActiveQuestion((index) => index - 1)} type="button">Précédente</button>}
          {lastQuestion ? <button disabled={!complete} onClick={() => void respond(false)} type="button">Envoyer les réponses</button> : <button disabled={!isAnswered(activeQuestion)} onClick={() => setActiveQuestion((index) => index + 1)} type="button">Suivante</button>}
        </div>
      </div>
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

// Affiche les demandes d'interface Pi génériques et renvoie l'action choisie par l'utilisateur.
function ExtensionDialog({ dialog, onClose, onError }: { dialog: UiDialog; onClose: () => void; onError: (cause: unknown) => void }) {
  const request = dialog.request
  const [value, setValue] = useState(typeof request.prefill === 'string' ? request.prefill : '')

  // Envoie la réponse RPC puis ferme la boîte de dialogue après confirmation du backend.
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

// Rend les valeurs techniques lisibles dans les libellés du composer sans modifier les valeurs RPC.
function capitalizeLabel(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value
}

// Utilise des pictogrammes SVG cohérents et indépendants d'une police ou d'un jeu d'emoji.
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

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function workspaceFileUrl(workspacePath: string, path: string): string | null {
  const root = new URL(workspacePath.endsWith('/') ? workspacePath : `${workspacePath}/`, 'file:///')
  const target = new URL(path, root)
  return target.pathname.startsWith(root.pathname) ? target.href : null
}

export default App
