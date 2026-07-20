import type { JsonObject } from '../shared/types.ts'

export interface ToolCall {
  id: string
  name: string
  args: unknown
}

export interface ToolResult {
  toolCallId: string
  toolName: string
  content: unknown
  isError: boolean
}

export interface ToolCallPresentation {
  headerDetail?: { text: string; title: string }
  pendingDetail?: string
}

export function toolCallsInMessage(message: JsonObject): ToolCall[] {
  if (message.role !== 'assistant' || !Array.isArray(message.content)) return []

  return message.content.flatMap((part) => {
    const call = toolCallFromValue(part)
    return call ? [call] : []
  })
}

export function toolCallInUpdate(event: JsonObject): ToolCall | null {
  if (event.type !== 'message_update' || !isObject(event.assistantMessageEvent)) return null
  const update = event.assistantMessageEvent
  return update.type === 'toolcall_end' ? toolCallFromValue(update.toolCall) : null
}

export function toolResultInMessage(message: JsonObject): ToolResult | null {
  if (message.role !== 'toolResult' || typeof message.toolCallId !== 'string' || typeof message.toolName !== 'string') return null
  return {
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    content: message.content,
    isError: message.isError === true,
  }
}

export function isToolCallPending(result: ToolResult | undefined): boolean {
  return result === undefined
}

export function toolContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (isObject(content) && 'content' in content) return toolContentText(content.content)
  if (!Array.isArray(content)) return ''
  return content.flatMap((part) => isObject(part) && part.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('\n')
}

export function formatToolData(value: unknown): string {
  try { return JSON.stringify(value, null, 2) ?? String(value) } catch { return String(value) }
}

export function truncateToolText(text: string, maxLength = 140): { text: string; truncated: boolean } {
  if (text.length <= maxLength) return { text, truncated: false }
  return { text: `${text.slice(0, maxLength)}…`, truncated: true }
}

export function toolCallPresentation(call: ToolCall): ToolCallPresentation {
  return toolCallPresentations[call.name]?.(call.args) ?? {}
}

const toolCallPresentations: Record<string, (args: unknown) => ToolCallPresentation> = {
  bash: bashPresentation,
}

// Adapte Bash en plaçant sa commande dans l'en-tête et son timeout dans le statut.
function bashPresentation(args: unknown): ToolCallPresentation {
  if (!isObject(args) || typeof args.command !== 'string') return {}

  const command = args.command
  const timeout = typeof args.timeout === 'number' && Number.isFinite(args.timeout) ? args.timeout : undefined
  return {
    headerDetail: { text: truncateToolText(command, 80).text, title: command },
    pendingDetail: timeout === undefined ? undefined : `timeout : ${timeout}s`,
  }
}

function toolCallFromValue(value: unknown): ToolCall | null {
  if (!isObject(value) || value.type !== 'toolCall' || typeof value.id !== 'string' || typeof value.name !== 'string') return null
  return { id: value.id, name: value.name, args: value.arguments }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
