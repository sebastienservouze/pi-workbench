import { memo, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type WheelEvent } from 'react'
import type { JsonObject } from '../../../shared/types.ts'
import { activityActionText, activityAgentName, type Activity } from './activity.ts'
import { formatTokens, formatTurnCost, turnUsageByMessage, type MessageUsage } from './message-usage.ts'
import { toolCallsInMessage, toolResultInMessage, type ToolExecution } from './tool-calls.ts'
import type { SessionAnalysisTarget } from '../session-analysis/session-analysis.ts'
import { outputContextDraft } from './context-session.ts'
import { ContextSessionButton, Markdown, ToolCallCard } from './ToolCallCard.tsx'

/** Assembles history, the live stream, and tool executions according to the selected detail level. */
export function Conversation({ activity, agentName, messages, liveText, liveThinking, detailedView, navigationRequest, repositoryRoot, scrollToBottomRequest, toolExecutions, workspacePath, onError, onStartSession }: {
  activity: Activity | null
  agentName?: string
  messages: JsonObject[]
  liveText: string
  liveThinking: string
  detailedView: boolean
  navigationRequest?: { id: number; target: SessionAnalysisTarget }
  repositoryRoot?: string | null
  scrollToBottomRequest: number
  toolExecutions: ToolExecution[]
  workspacePath: string
  onError: (cause: unknown) => void
  onStartSession: (draft: string) => Promise<void>
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
  const [highlightedTarget, setHighlightedTarget] = useState<string>()

  // Scrolls automatically when new content arrives unless the user has scrolled up.
  useEffect(() => {
    if (!autoScrollRef.current) return
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior })
  }, [activity, visibleMessages.length, liveText, liveThinking, toolExecutions])

  useEffect(() => {
    if (scrollToBottomRequest > 0) resumeAutoScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToBottomRequest])

  useEffect(() => {
    if (!navigationRequest) return
    const targetKey = navigationTargetKey(navigationRequest.target)
    const selector = navigationRequest.target.kind === 'tool'
      ? `[data-tool-call-id="${CSS.escape(navigationRequest.target.id)}"]`
      : `[data-message-index="${navigationRequest.target.index}"]`
    const target = conversationRef.current?.querySelector<HTMLElement>(selector)
    if (!target) return
    autoScrollRef.current = false
    setShowScrollToBottom(true)
    setHighlightedTarget(targetKey)
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })
    const timeout = window.setTimeout(() => setHighlightedTarget(undefined), 1800)
    return () => window.clearTimeout(timeout)
  }, [navigationRequest])

  /** Detects whether the user is at the bottom to enable or suspend automatic scrolling. */
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

  /** Resumes automatic scrolling and returns to the bottom of the conversation. */
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
        return <div className={highlightedTarget === `message:${index}` ? 'conversation-target' : undefined} data-message-index={index} key={`${String(message.timestamp ?? '')}-${index}`}>
          {isVisibleConversationMessage(message) && <MessageCard message={message} onStartSession={onStartSession} usage={usagesByMessage.get(index)} />}
          {calls.map((call) => {
            const execution = executionsByCallId.get(call.id)
            const result = resultsByCallId.get(call.id) ?? execution?.result
            return <ToolCallCard args={call.args} hasResult={result !== undefined} id={call.id} interrupted={execution?.status === 'interrupted'} key={call.id} name={call.name} onError={onError} onStartSession={onStartSession} rawArgs={execution?.rawArgs} rawArgsLength={execution?.rawArgsLength} rawArgsTruncated={execution?.rawArgsTruncated} repositoryRoot={repositoryRoot} resultContent={result?.content} resultError={result?.isError} revealRequest={navigationRequest?.target.kind === 'tool' && navigationRequest.target.id === call.id ? navigationRequest.id : undefined} streaming={execution?.status === 'generating'} targeted={highlightedTarget === `tool:${call.id}`} workspacePath={workspacePath} />
          })}
        </div>
      })}
      {liveThinking && <ReasoningBlock live>{liveThinking}</ReasoningBlock>}
      {detailedView && toolExecutions.filter((execution) => !toolCallIds.has(execution.id)).map((execution) => <ToolCallCard animateLiveChanges args={execution.args} hasResult={execution.result !== undefined} id={execution.id} interrupted={execution.status === 'interrupted'} key={execution.id} name={execution.name} onError={onError} onStartSession={onStartSession} rawArgs={execution.rawArgs} rawArgsLength={execution.rawArgsLength} rawArgsTruncated={execution.rawArgsTruncated} repositoryRoot={repositoryRoot} resultContent={execution.result?.content} resultError={execution.result?.isError} revealRequest={navigationRequest?.target.kind === 'tool' && navigationRequest.target.id === execution.id ? navigationRequest.id : undefined} streaming={execution.status === 'generating'} targeted={highlightedTarget === `tool:${execution.id}`} workspacePath={workspacePath} />)}
      {liveText && <article className="message assistant streaming conversation-entry"><div className="content"><Markdown>{liveText}</Markdown></div></article>}
      {visibleMessages.length === 0 && !liveText && !liveThinking && <div className="empty-conversation"><h2>Session ready</h2><p>Send a message or use a command from your Pi installation.</p></div>}
      {activity && <div className="conversation-activity"><ActivityIndicator activity={activity} agentName={agentName} /></div>}
      <button
        aria-label="Resume automatic scrolling"
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

const MessageCard = memo(function MessageCard({ message, onStartSession, usage }: { message: JsonObject; onStartSession: (draft: string) => Promise<void>; usage?: MessageUsage }) {
  if (message.role === 'custom' && typeof message.customType === 'string') return <DefaultCustomMessage message={message} />
  return <DefaultMessageCard message={message} onStartSession={onStartSession} usage={usage} />
})

const DefaultMessageCard = memo(function DefaultMessageCard({ message, onStartSession, usage }: { message: JsonObject; onStartSession: (draft: string) => Promise<void>; usage?: MessageUsage }) {
  const role = String(message.role)
  const timestamp = typeof message.timestamp === 'number' ? new Date(message.timestamp) : null
  const time = timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp : null
  const output = role === 'assistant' ? visibleText(message.content ?? message.output) : ''
  return <article className={`message ${role}`}>
    <div className="content">{renderContent(message.content ?? message.output)}</div>
    {output && <ContextSessionButton onClick={() => onStartSession(outputContextDraft(output))} />}
    {usage && <TurnUsage usage={usage} />}
    {role === 'user' && time && <time className="message-time" dateTime={time.toISOString()}>{time.toLocaleTimeString(navigator.language, { hour: '2-digit', minute: '2-digit' })}</time>}
  </article>
})

/** Renders an unknown custom message without interpreting extension-specific details. */
function DefaultCustomMessage({ message }: { message: JsonObject & { customType?: unknown } }) {
  const content = hasVisibleContent(message.content) ? renderContent(message.content) : <p>Message sans contenu affichable.</p>
  return <article className="message custom-message">
    <code className="custom-message-type">{String(message.customType)}</code>
    <div className="content">{content}</div>
  </article>
}

/** Displays counters billed by Pi for a completed assistant response. */
function TurnUsage({ usage }: { usage: MessageUsage }) {
  return <dl className="turn-usage">
    <div><dt>Cost</dt><dd>{formatTurnCost(usage.cost)}</dd></div>
    <div><dt>Cache read</dt><dd>{formatTokens(usage.cacheRead)}</dd></div>
    <div><dt>Cache miss</dt><dd>{formatTokens(usage.cacheMiss)}</dd></div>
    <div><dt>Output</dt><dd>{formatTokens(usage.output)}</dd></div>
  </dl>
}

/** Displays Pi's current work state in the conversation thread. */
export function ActivityIndicator({ activity, agentName }: { activity: Activity; agentName?: string }) {
  return <div className="pi-activity" role="status"><span aria-hidden="true" className="activity-signal"><i /><i /><i /></span><span className="activity-text"><span>{activityAgentName(agentName)}</span>{' '}<span className="activity-action" key={activity.kind}>{activityActionText(activity)}</span></span></div>
}

function isVisibleConversationMessage(message: JsonObject): boolean {
  const role = message.role
  if (role === 'custom') return message.display === true && typeof message.customType === 'string'
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

function visibleText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap((part) => isObject(part) && part.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('')
}

/** Renders assistant content in order, including visible thinking. */
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

/** Presents thinking directly in the thread with a subtle hierarchy. */
function ReasoningBlock({ children, live = false }: { children: string; live?: boolean }) {
  return <div className={`reasoning${live ? ' conversation-entry' : ''}`}><Markdown>{children}</Markdown></div>
}

function isImageContent(value: unknown): value is JsonObject & { data: string; mimeType: string } {
  return isObject(value) && value.type === 'image' && typeof value.data === 'string' && typeof value.mimeType === 'string' && /^image\/(?:gif|jpeg|png|webp)$/.test(value.mimeType)
}

function navigationTargetKey(target: SessionAnalysisTarget): string {
  return target.kind === 'tool' ? `tool:${target.id}` : `message:${target.index}`
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
