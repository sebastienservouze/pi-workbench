import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
export function Conversation({ messages, liveText, activity, agentName, detailedView, repositoryRoot, scrollToBottomRequest, systemMessages, toolExecutions, workspacePath }: {
  messages: JsonObject[]
  liveText: string
  activity: Activity | null
  agentName?: string
  detailedView: boolean
  repositoryRoot?: string | null
  scrollToBottomRequest: number
  systemMessages: JsonObject[]
  toolExecutions: ToolExecution[]
  workspacePath: string
}) {
  /** Fusionne les messages système dans l'historique en respectant la chronologie. */
  const allMessages = useMemo(() => {
    if (systemMessages.length === 0) return messages
    const merged = [...systemMessages, ...messages]
    merged.sort((a, b) => {
      const ta = typeof a.timestamp === 'number' ? a.timestamp : 0
      const tb = typeof b.timestamp === 'number' ? b.timestamp : 0
      return ta - tb
    })
    return merged
  }, [messages, systemMessages])
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
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  // Défile automatiquement vers le bas quand du nouveau contenu arrive, sauf si l'utilisateur est remonté.
  useEffect(() => {
    if (!autoScrollRef.current) return
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior })
  }, [visibleMessages.length, liveText, activity, toolExecutions])

  useEffect(() => {
    if (scrollToBottomRequest > 0) resumeAutoScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToBottomRequest])

  /** Détecte si l'utilisateur est en bas de la conversation pour activer ou suspendre le défilement automatique. */
  function handleConversationScroll(): void {
    const el = conversationRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    autoScrollRef.current = nearBottom
    setShowScrollToBottom(!nearBottom)
  }

  /** Reprend le défilement automatique et ramène au bas de la conversation. */
  function resumeAutoScroll(): void {
    autoScrollRef.current = true
    setShowScrollToBottom(false)
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' })
  }

  return (
    <section className="conversation" aria-live="polite" onScroll={handleConversationScroll} ref={conversationRef}>
      {allMessages.map((message, index) => {
        const calls = detailedView ? toolCallsInMessage(message) : []
        if (!isVisibleConversationMessage(message) && calls.length === 0) return null
        return <div key={`${String(message.timestamp ?? '')}-${index}`}>
          {isVisibleConversationMessage(message) && <MessageCard message={message} usage={usagesByMessage.get(index)} />}
          {calls.map((call) => {
            const result = resultsByCallId.get(call.id) ?? executionsByCallId.get(call.id)?.result
            return <ToolCallCard args={call.args} hasResult={result !== undefined} id={call.id} key={call.id} name={call.name} repositoryRoot={repositoryRoot} resultContent={result?.content} resultError={result?.isError} workspacePath={workspacePath} />
          })}
        </div>
      })}
      {detailedView && toolExecutions.filter((execution) => !toolCallIds.has(execution.id)).map((execution) => <ToolCallCard args={execution.args} hasResult={execution.result !== undefined} id={execution.id} key={execution.id} name={execution.name} repositoryRoot={repositoryRoot} resultContent={execution.result?.content} resultError={execution.result?.isError} workspacePath={workspacePath} />)}
      {liveText && <article className="message assistant streaming"><div className="content"><Markdown>{liveText}</Markdown></div></article>}
      {activity && activity.kind !== 'writing' && <ActivityIndicator activity={activity} agentName={agentName} />}
      {visibleMessages.length === 0 && !liveText && !activity && <div className="empty-conversation"><h2>Session prête</h2><p>Envoyez un message ou utilisez une commande de votre installation Pi.</p></div>}
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

function ActivityIndicator({ activity, agentName }: { activity: Activity; agentName?: string }) {
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

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatTokens(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
}
