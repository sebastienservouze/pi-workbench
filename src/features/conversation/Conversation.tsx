import { memo, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type WheelEvent } from 'react'
import type { JsonObject } from '../../../shared/types.ts'
import { activityText, type Activity } from './activity.ts'
import { formatTurnCost, turnUsageByMessage, type MessageUsage } from './message-usage.ts'
import { toolCallsInMessage, toolResultInMessage, type ToolExecution } from './tool-calls.ts'
import { Markdown, ToolCallCard } from './ToolCallCard.tsx'

/** Assemble l'historique, le flux en cours et les exécutions d'outils selon le niveau de détail choisi. */
export function Conversation({ activity, agentName, messages, liveText, liveThinking, detailedView, repositoryRoot, scrollToBottomRequest, toolExecutions, workspacePath }: {
  activity: Activity | null
  agentName?: string
  messages: JsonObject[]
  liveText: string
  liveThinking: string
  detailedView: boolean
  repositoryRoot?: string | null
  scrollToBottomRequest: number
  toolExecutions: ToolExecution[]
  workspacePath: string
}) {
  const allMessages = messages
  const visibleMessages = allMessages.filter(isVisibleConversationMessage)
  const usagesByMessage = turnUsageByMessage(allMessages)
  const toolCalls = allMessages.flatMap(toolCallsInMessage)
  const toolCallIds = new Set(toolCalls.map((call) => call.id))
  const resultsByCallId = new Map(allMessages.flatMap((message) => {
    const result = toolResultInMessage(message)
    return result ? [[result.toolCallId, result] as const] : []
  }))
  const executionsByCallId = new Map(toolExecutions.map((execution) => [execution.id, execution]))
  const conversationRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const userScrollIntentRef = useRef(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  // Défile automatiquement vers le bas quand du nouveau contenu arrive, sauf si l'utilisateur est remonté.
  useEffect(() => {
    if (!autoScrollRef.current) return
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior })
  }, [activity, visibleMessages.length, liveText, liveThinking, toolExecutions])

  useEffect(() => {
    if (scrollToBottomRequest > 0) resumeAutoScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToBottomRequest])

  /** Détecte si l'utilisateur est en bas de la conversation pour activer ou suspendre le défilement automatique. */
  function handleConversationScroll(): void {
    const el = conversationRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    if (nearBottom) {
      userScrollIntentRef.current = false
      autoScrollRef.current = true
      setShowScrollToBottom(false)
      return
    }
    if (!userScrollIntentRef.current) return
    userScrollIntentRef.current = false
    autoScrollRef.current = false
    setShowScrollToBottom(true)
  }

  function markUserScrollIntent(): void {
    userScrollIntentRef.current = true
  }

  function handleConversationWheel(event: WheelEvent<HTMLDivElement>): void {
    if (event.deltaY !== 0) markUserScrollIntent()
  }

  function handleConversationKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) markUserScrollIntent()
  }

  /** Reprend le défilement automatique et ramène au bas de la conversation. */
  function resumeAutoScroll(): void {
    userScrollIntentRef.current = false
    autoScrollRef.current = true
    setShowScrollToBottom(false)
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' })
  }

  return (
    <section
      aria-live="polite"
      className="conversation"
      onKeyDown={handleConversationKeyDown}
      onPointerMove={(event) => { if (event.buttons > 0) markUserScrollIntent() }}
      onScroll={handleConversationScroll}
      onTouchMove={markUserScrollIntent}
      onWheel={handleConversationWheel}
      ref={conversationRef}
      tabIndex={0}
    >
      {allMessages.map((message, index) => {
        const calls = detailedView ? toolCallsInMessage(message) : []
        if (!isVisibleConversationMessage(message) && calls.length === 0) return null
        return <div key={`${String(message.timestamp ?? '')}-${index}`}>
          {isVisibleConversationMessage(message) && <MessageCard message={message} usage={usagesByMessage.get(index)} />}
          {calls.map((call) => {
            const execution = executionsByCallId.get(call.id)
            const result = resultsByCallId.get(call.id) ?? execution?.result
            return <ToolCallCard args={call.args} hasResult={result !== undefined} id={call.id} interrupted={execution?.status === 'interrupted'} key={call.id} name={call.name} rawArgs={execution?.rawArgs} repositoryRoot={repositoryRoot} resultContent={result?.content} resultError={result?.isError} streaming={execution?.status === 'generating'} workspacePath={workspacePath} />
          })}
        </div>
      })}
      {liveThinking && <ReasoningBlock live>{liveThinking}</ReasoningBlock>}
      {detailedView && toolExecutions.filter((execution) => !toolCallIds.has(execution.id)).map((execution) => <ToolCallCard animateLiveChanges args={execution.args} hasResult={execution.result !== undefined} id={execution.id} interrupted={execution.status === 'interrupted'} key={execution.id} name={execution.name} rawArgs={execution.rawArgs} repositoryRoot={repositoryRoot} resultContent={execution.result?.content} resultError={execution.result?.isError} streaming={execution.status === 'generating'} workspacePath={workspacePath} />)}
      {liveText && <article className="message assistant streaming conversation-entry"><div className="content"><Markdown>{liveText}</Markdown></div></article>}
      {visibleMessages.length === 0 && !liveText && !liveThinking && <div className="empty-conversation"><h2>Session prête</h2><p>Envoyez un message ou utilisez une commande de votre installation Pi.</p></div>}
      {activity && <div className="conversation-activity"><ActivityIndicator activity={activity} agentName={agentName} /></div>}
      <button
        aria-label="Reprendre le défilement automatique"
        className={`scroll-to-bottom${showScrollToBottom ? ' visible' : ''}`}
        onClick={resumeAutoScroll}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
          <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      </button>
    </section>
  )
}

const MessageCard = memo(function MessageCard({ message, usage }: { message: JsonObject; usage?: MessageUsage }) {
  const role = String(message.role)
  const timestamp = typeof message.timestamp === 'number' ? new Date(message.timestamp) : null
  const time = timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null
  return <article className={`message ${role}`}><div className="content">{renderContent(message.content ?? message.output)}</div>{usage && <TurnUsage usage={usage} />}{role === 'user' && time && <time className="message-time" dateTime={time.toISOString()}>{time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>}</article>
})

/** Affiche les compteurs facturés par Pi pour une réponse assistant terminée. */
function TurnUsage({ usage }: { usage: MessageUsage }) {
  return <dl className="turn-usage">
    <div><dt>Coût</dt><dd>{formatTurnCost(usage.cost)}</dd></div>
    <div><dt>Cache read</dt><dd>{formatTokens(usage.cacheRead)}</dd></div>
    <div><dt>Cache miss</dt><dd>{formatTokens(usage.cacheMiss)}</dd></div>
    <div><dt>Output</dt><dd>{formatTokens(usage.output)}</dd></div>
  </dl>
}

/** Affiche l'état de travail courant de Pi dans le fil de conversation. */
export function ActivityIndicator({ activity, agentName }: { activity: Activity; agentName?: string }) {
  return <div className="pi-activity" role="status"><span aria-hidden="true" className="spinner" /><span className="activity-text" key={activity.kind}>{activityText(activity, agentName)}</span></div>
}

function isVisibleConversationMessage(message: JsonObject): boolean {
  const role = message.role
  return (role === 'user' || role === 'assistant' || role === 'system') && hasVisibleContent(message.content ?? message.output)
}

function hasVisibleContent(content: unknown): boolean {
  if (typeof content === 'string') return content.trim().length > 0
  return Array.isArray(content) && content.some((part) => isObject(part) && (
    (part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0)
    || (part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking.trim().length > 0)
    || isImageContent(part)
  ))
}

/** Rend les contenus assistant dans leur ordre, dont les réflexions visibles. */
function renderContent(content: unknown): ReactNode {
  if (typeof content === 'string') return <Markdown>{content}</Markdown>
  if (!Array.isArray(content)) return null
  return <>{content.map((part, contentIndex) => {
    if (isImageContent(part)) return <img alt={`Image jointe ${contentIndex + 1}`} className="message-image" key={`image-${contentIndex}`} src={`data:${part.mimeType};base64,${part.data}`} />
    if (!isObject(part)) return null
    if (part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking.trim()) return <ReasoningBlock key={`reasoning-${contentIndex}`}>{part.thinking}</ReasoningBlock>
    if (part.type === 'text' && typeof part.text === 'string') return <Markdown key={`text-${contentIndex}`}>{part.text}</Markdown>
    return null
  })}</>
}

/** Présente une réflexion directement dans le fil avec une hiérarchie discrète. */
function ReasoningBlock({ children, live = false }: { children: string; live?: boolean }) {
  return <div className={`reasoning${live ? ' conversation-entry' : ''}`}><Markdown>{children}</Markdown></div>
}

function isImageContent(value: unknown): value is JsonObject & { data: string; mimeType: string } {
  return isObject(value) && value.type === 'image' && typeof value.data === 'string' && typeof value.mimeType === 'string' && /^image\/(?:gif|jpeg|png|webp)$/.test(value.mimeType)
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatTokens(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
}
