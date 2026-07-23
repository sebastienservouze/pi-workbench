import { memo, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type WheelEvent } from 'react'
import type { JsonObject } from '../../../shared/types.ts'
import { activityText, type Activity } from './activity.ts'
import { formatTurnCost, turnUsageByMessage, type MessageUsage } from './message-usage.ts'
import { toolCallsInMessage, toolResultInMessage, type ToolResult } from './tool-calls.ts'
import { Markdown, ToolCallCard } from './ToolCallCard.tsx'

export interface ToolExecution {
  id: string
  name: string
  args: unknown
  result?: ToolResult
}

/** Assemble l'historique, le flux en cours et les exécutions d'outils selon le niveau de détail choisi. */
export function Conversation({ messages, liveText, liveThinking, reasoningTurn, detailedView, repositoryRoot, scrollToBottomRequest, toolExecutions, workspacePath }: {
  messages: JsonObject[]
  liveText: string
  liveThinking: string
  reasoningTurn: number
  detailedView: boolean
  repositoryRoot?: string | null
  scrollToBottomRequest: number
  toolExecutions: ToolExecution[]
  workspacePath: string
}) {
  const allMessages = messages
  const visibleMessages = allMessages.filter(isVisibleConversationMessage)
  const latestHistoricReasoning = lastReasoningKey(allMessages)
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
  const [expandedReasoning, setExpandedReasoning] = useState<string | null | undefined>(undefined)
  const activeReasoningTurnRef = useRef(reasoningTurn)
  const hasLiveThinkingRef = useRef(false)
  const initializedReasoningRef = useRef(false)

  useEffect(() => {
    if (activeReasoningTurnRef.current !== reasoningTurn) {
      activeReasoningTurnRef.current = reasoningTurn
      hasLiveThinkingRef.current = false
      setExpandedReasoning(null)
      return
    }
    if (liveThinking) {
      if (!hasLiveThinkingRef.current) setExpandedReasoning('live')
      hasLiveThinkingRef.current = true
      return
    }
    if (hasLiveThinkingRef.current) {
      hasLiveThinkingRef.current = false
      setExpandedReasoning(latestHistoricReasoning)
      return
    }
    if (!initializedReasoningRef.current && latestHistoricReasoning) {
      initializedReasoningRef.current = true
      setExpandedReasoning(latestHistoricReasoning)
    }
  }, [latestHistoricReasoning, liveThinking, reasoningTurn])

  // Défile automatiquement vers le bas quand du nouveau contenu arrive, sauf si l'utilisateur est remonté.
  useEffect(() => {
    if (!autoScrollRef.current) return
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior })
  }, [visibleMessages.length, liveText, liveThinking, toolExecutions])

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
          {isVisibleConversationMessage(message) && <MessageCard expandedReasoning={expandedReasoning} message={message} messageIndex={index} onReasoningToggle={setExpandedReasoning} usage={usagesByMessage.get(index)} />}
          {calls.map((call) => {
            const result = resultsByCallId.get(call.id) ?? executionsByCallId.get(call.id)?.result
            return <ToolCallCard args={call.args} hasResult={result !== undefined} id={call.id} key={call.id} name={call.name} repositoryRoot={repositoryRoot} resultContent={result?.content} resultError={result?.isError} workspacePath={workspacePath} />
          })}
        </div>
      })}
      {detailedView && toolExecutions.filter((execution) => !toolCallIds.has(execution.id)).map((execution) => <ToolCallCard args={execution.args} hasResult={execution.result !== undefined} id={execution.id} key={execution.id} name={execution.name} repositoryRoot={repositoryRoot} resultContent={execution.result?.content} resultError={execution.result?.isError} workspacePath={workspacePath} />)}
      {liveThinking && <ReasoningBlock expandedReasoning={expandedReasoning} onToggle={setExpandedReasoning} reasoningKey="live">{liveThinking}</ReasoningBlock>}
      {liveText && <article className="message assistant streaming"><div className="content"><Markdown>{liveText}</Markdown></div></article>}
      {visibleMessages.length === 0 && !liveText && !liveThinking && <div className="empty-conversation"><h2>Session prête</h2><p>Envoyez un message ou utilisez une commande de votre installation Pi.</p></div>}
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

const MessageCard = memo(function MessageCard({ expandedReasoning, message, messageIndex, onReasoningToggle, usage }: { expandedReasoning: string | null | undefined; message: JsonObject; messageIndex: number; onReasoningToggle: (key: string | null) => void; usage?: MessageUsage }) {
  const role = String(message.role)
  const timestamp = typeof message.timestamp === 'number' ? new Date(message.timestamp) : null
  const time = timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null
  return <article className={`message ${role}`}><div className="content">{renderContent(message.content ?? message.output, messageIndex, expandedReasoning, onReasoningToggle)}</div>{usage && <TurnUsage usage={usage} />}{role === 'user' && time && <time className="message-time" dateTime={time.toISOString()}>{time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>}</article>
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

/** Affiche l'état de travail courant de Pi à proximité du composer. */
export function ActivityIndicator({ activity, agentName }: { activity: Activity; agentName?: string }) {
  return <div className="pi-activity" role="status"><span aria-hidden="true" className="spinner" /><span className="activity-text">{activityText(activity, agentName)}</span></div>
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

/** Rend les contenus assistant dans leur ordre, dont les raisonnements repliables. */
function renderContent(content: unknown, messageIndex: number, expandedReasoning: string | null | undefined, onReasoningToggle: (key: string | null) => void): ReactNode {
  if (typeof content === 'string') return <Markdown>{content}</Markdown>
  if (!Array.isArray(content)) return null
  return <>{content.map((part, contentIndex) => {
    if (isImageContent(part)) return <img alt={`Image jointe ${contentIndex + 1}`} className="message-image" key={`image-${contentIndex}`} src={`data:${part.mimeType};base64,${part.data}`} />
    if (!isObject(part)) return null
    if (part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking.trim()) return <ReasoningBlock expandedReasoning={expandedReasoning} key={`reasoning-${contentIndex}`} onToggle={onReasoningToggle} reasoningKey={reasoningKey(messageIndex, contentIndex)}>{part.thinking}</ReasoningBlock>
    if (part.type === 'text' && typeof part.text === 'string') return <Markdown key={`text-${contentIndex}`}>{part.text}</Markdown>
    return null
  })}</>
}

/** Présente un raisonnement consultable sans alourdir le fil de discussion. */
function ReasoningBlock({ children, expandedReasoning, onToggle, reasoningKey }: { children: string; expandedReasoning: string | null | undefined; onToggle: (key: string | null) => void; reasoningKey: string }) {
  return <details className="reasoning" onToggle={(event) => onToggle(event.currentTarget.open ? reasoningKey : null)} open={expandedReasoning === reasoningKey}>
    <summary>Raisonnement</summary>
    <div className="reasoning-content"><Markdown>{children}</Markdown></div>
  </details>
}

/** Retrouve le dernier raisonnement historique pour l'ouvrir à l'arrivée dans une session. */
function lastReasoningKey(messages: JsonObject[]): string | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const content = messages[messageIndex].content ?? messages[messageIndex].output
    if (!Array.isArray(content)) continue
    for (let contentIndex = content.length - 1; contentIndex >= 0; contentIndex -= 1) {
      const part = content[contentIndex]
      if (isObject(part) && part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking.trim()) return reasoningKey(messageIndex, contentIndex)
    }
  }
  return null
}

function reasoningKey(messageIndex: number, contentIndex: number): string {
  return `${messageIndex}-${contentIndex}`
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
