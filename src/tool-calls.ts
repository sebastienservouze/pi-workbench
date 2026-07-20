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

export function toolCallsInMessage(message: JsonObject): ToolCall[] {
  if (message.role !== 'assistant' || !Array.isArray(message.content)) return []

  return message.content.flatMap((part) => {
    if (!isObject(part) || part.type !== 'toolCall' || typeof part.id !== 'string' || typeof part.name !== 'string') return []
    return [{ id: part.id, name: part.name, args: part.arguments }]
  })
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

export function toolContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (isObject(content) && 'content' in content) return toolContentText(content.content)
  if (!Array.isArray(content)) return ''
  return content.flatMap((part) => isObject(part) && part.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('\n')
}

export function formatToolData(value: unknown): string {
  try { return JSON.stringify(value, null, 2) ?? String(value) } catch { return String(value) }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
