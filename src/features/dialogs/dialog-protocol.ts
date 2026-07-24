import { askUserQuestionProtocol, parseAskUserQuestionRequest } from '../../../shared/ask-user-question.ts'
import type { JsonObject } from '../../../shared/types.ts'

export interface UiDialog {
  sessionId: string
  request: JsonObject
}

export function isAskUserQuestionDialog(value: JsonObject): boolean {
  const payload = typeof value.prefill === 'string' ? safeJsonParse(value.prefill) : null
  return value.method === 'editor'
    && value.title === 'Pi Livecraft questionnaire'
    && isObject(payload)
    && payload.protocol === askUserQuestionProtocol
    && parseAskUserQuestionRequest(payload) !== null
}

export function isAgentSelector(value: JsonObject): value is JsonObject & { id: string; options: unknown[] } {
  return value.method === 'select'
    && value.title === 'Select an agent'
    && typeof value.id === 'string'
    && Array.isArray(value.options)
}

export function isBlockingDialog(value: JsonObject): boolean {
  return value.method === 'select' || value.method === 'confirm' || value.method === 'input' || value.method === 'editor'
}

function safeJsonParse(value: string): unknown {
  try { return JSON.parse(value) } catch { return null }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
