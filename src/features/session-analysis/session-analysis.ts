import type { JsonObject, SessionStats } from '../../../shared/types.ts'
import { messageUsage, turnUsageByMessage, type MessageUsage } from '../conversation/message-usage.ts'
import { toolCallsInMessage, toolContentText, toolDataLength, toolResultInMessage, type ToolExecution } from '../conversation/tool-calls.ts'

export type SessionAnalysisTarget = { kind: 'message'; index: number } | { kind: 'tool'; id: string }

export interface AnalyzedToolCall {
  id: string
  name: string
  requestMessageIndex: number
  inputLength: number
  outputLength: number
  isError: boolean
  pending: boolean
  durationMs?: number
}

export interface AnalyzedRequest {
  messageIndex: number
  title: string
  cost: number
  usage: MessageUsage
  modelCallCount: number
  toolCalls: AnalyzedToolCall[]
  failedToolCalls: number
  complete: boolean
  durationMs?: number
}

export interface ToolSummary {
  name: string
  count: number
  failed: number
  outputLength: number
  durationMs: number
  measuredDurationCount: number
}

export interface SessionAnalysis {
  requests: AnalyzedRequest[]
  toolCalls: AnalyzedToolCall[]
  tools: ToolSummary[]
  totalCost: number
  costAvailable: boolean
  attributedCost: number
  attributionAvailable: boolean
  unattributedCost: number
  averageTurnCost: number
  medianTurnCost: number
  turnCount: number
  averageToolCallsPerTurn: number
  totalToolCalls: number
  failedToolCalls: number
  contextPercent?: number
  tokens: MessageUsage
  tokensAvailable: boolean
}

interface AnalysisTelemetry {
  requestDurations?: ReadonlyMap<number, number>
  toolDurations?: ReadonlyMap<string, number>
  toolExecutions?: ToolExecution[]
}

interface MutableRequest extends AnalyzedRequest {
  usage: MessageUsage
}

const emptyUsage = (): MessageUsage => ({ cacheMiss: 0, cacheRead: 0, cacheWrite: 0, cost: 0, output: 0 })

/** Reconstruit les requêtes et leurs appels à partir du contrat de messages public de Pi. */
export function analyzeSession(messages: JsonObject[], stats: SessionStats | null, running: boolean, telemetry: AnalysisTelemetry = {}): SessionAnalysis {
  const resultsByCallId = new Map(messages.flatMap((message) => {
    const result = toolResultInMessage(message)
    return result ? [[result.toolCallId, result] as const] : []
  }))
  const executionsByCallId = new Map(telemetry.toolExecutions?.map((execution) => [execution.id, execution]) ?? [])
  const requests: MutableRequest[] = []
  const seenToolCallIds = new Set<string>()
  let currentRequest: MutableRequest | undefined

  messages.forEach((message, messageIndex) => {
    if (message.role === 'user') {
      currentRequest = {
        messageIndex,
        title: messageTitle(message),
        cost: 0,
        usage: emptyUsage(),
        modelCallCount: 0,
        toolCalls: [],
        failedToolCalls: 0,
        complete: true,
        durationMs: typeof message.timestamp === 'number' ? telemetry.requestDurations?.get(message.timestamp) : undefined,
      }
      requests.push(currentRequest)
      return
    }
    if (!currentRequest) return

    if (message.role === 'assistant') {
      const usage = messageUsage(message)
      if (usage) {
        addUsage(currentRequest.usage, usage)
        currentRequest.modelCallCount += 1
      }
      for (const call of toolCallsInMessage(message)) {
        const execution = executionsByCallId.get(call.id)
        const result = resultsByCallId.get(call.id) ?? execution?.result
        const analyzedCall: AnalyzedToolCall = {
          id: call.id,
          name: call.name,
          requestMessageIndex: currentRequest.messageIndex,
          inputLength: toolDataLength(call.args),
          outputLength: result ? toolContentText(result.content).length : 0,
          isError: result?.isError === true,
          pending: result === undefined,
          durationMs: telemetry.toolDurations?.get(call.id),
        }
        currentRequest.toolCalls.push(analyzedCall)
        seenToolCallIds.add(call.id)
      }
      return
    }

    if (message.role === 'toolResult') {
      const usage = messageUsage(message)
      if (usage) addUsage(currentRequest.usage, usage)
    }
  })

  const activeRequest = requests.at(-1) ?? createActiveRequest()
  for (const execution of telemetry.toolExecutions ?? []) {
    if (seenToolCallIds.has(execution.id)) continue
    const call: AnalyzedToolCall = {
      id: execution.id,
      name: execution.name,
      requestMessageIndex: activeRequest.messageIndex,
      inputLength: toolDataLength(execution.args),
      outputLength: execution.result ? toolContentText(execution.result.content).length : 0,
      isError: execution.result?.isError === true,
      pending: execution.result === undefined,
      durationMs: telemetry.toolDurations?.get(execution.id),
    }
    activeRequest.toolCalls.push(call)
    seenToolCallIds.add(execution.id)
  }
  if (activeRequest.messageIndex === -1 && activeRequest.toolCalls.length > 0) requests.push(activeRequest)

  requests.forEach((request, index) => {
    request.cost = request.usage.cost
    request.failedToolCalls = request.toolCalls.filter((call) => call.isError).length
    request.complete = index < requests.length - 1 || !running
  })

  const toolCalls = requests.flatMap((request) => request.toolCalls)
  const attributedCost = requests.reduce((total, request) => total + request.cost, 0)
  const statsCost = finiteNumber(stats?.cost)
  const attributionAvailable = requests.some((request) => request.modelCallCount > 0)
  const totalCost = statsCost ?? attributedCost
  const turnCosts = [...turnUsageByMessage(messages).values()].map((usage) => usage.cost).sort((a, b) => a - b)
  const parsedUsage = requests.reduce((total, request) => addUsage(total, request.usage), emptyUsage())
  const statsTokens = statsUsage(stats)
  const tokens = statsTokens ?? parsedUsage
  const totalToolCalls = Math.max(stats?.toolCalls ?? 0, toolCalls.length)

  return {
    requests,
    toolCalls,
    tools: summarizeTools(toolCalls),
    totalCost,
    costAvailable: statsCost !== undefined || attributionAvailable,
    attributedCost,
    attributionAvailable,
    unattributedCost: statsCost !== undefined && attributionAvailable ? Math.max(0, totalCost - attributedCost) : 0,
    averageTurnCost: turnCosts.length ? turnCosts.reduce((total, cost) => total + cost, 0) / turnCosts.length : 0,
    medianTurnCost: quantile(turnCosts, 0.5),
    turnCount: turnCosts.length,
    averageToolCallsPerTurn: turnCosts.length ? totalToolCalls / turnCosts.length : 0,
    totalToolCalls,
    failedToolCalls: toolCalls.filter((call) => call.isError).length,
    contextPercent: finiteNumber(stats?.contextUsage?.percent),
    tokens,
    tokensAvailable: statsTokens !== null || attributionAvailable,
  }
}

function createActiveRequest(): MutableRequest {
  return { messageIndex: -1, title: 'Requête en cours', cost: 0, usage: emptyUsage(), modelCallCount: 0, toolCalls: [], failedToolCalls: 0, complete: false }
}

function addUsage(target: MessageUsage, usage: MessageUsage): MessageUsage {
  target.cacheMiss += usage.cacheMiss
  target.cacheRead += usage.cacheRead
  target.cacheWrite += usage.cacheWrite
  target.cost += usage.cost
  target.output += usage.output
  return target
}

function statsUsage(stats: SessionStats | null): MessageUsage | null {
  const tokens = stats?.tokens
  if (!tokens) return null
  const cacheMiss = finiteNumber(tokens.input)
  const cacheRead = finiteNumber(tokens.cacheRead)
  const cacheWrite = finiteNumber(tokens.cacheWrite)
  const output = finiteNumber(tokens.output)
  if (cacheMiss === undefined || cacheRead === undefined || cacheWrite === undefined || output === undefined) return null
  return { cacheMiss, cacheRead, cacheWrite, cost: finiteNumber(stats?.cost) ?? 0, output }
}

function summarizeTools(calls: AnalyzedToolCall[]): ToolSummary[] {
  const summaries = new Map<string, ToolSummary>()
  for (const call of calls) {
    const summary = summaries.get(call.name) ?? { name: call.name, count: 0, failed: 0, outputLength: 0, durationMs: 0, measuredDurationCount: 0 }
    summary.count += 1
    summary.failed += Number(call.isError)
    summary.outputLength += call.outputLength
    if (call.durationMs !== undefined) {
      summary.durationMs += call.durationMs
      summary.measuredDurationCount += 1
    }
    summaries.set(call.name, summary)
  }
  return [...summaries.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function messageTitle(message: JsonObject): string {
  const content = message.content
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.flatMap((part) => isObject(part) && part.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join(' ')
      : ''
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > 90 ? `${normalized.slice(0, 89)}…` : normalized || 'Requête sans texte'
}

function quantile(sortedValues: number[], proportion: number): number {
  if (sortedValues.length === 0) return 0
  return sortedValues[Math.max(0, Math.ceil(sortedValues.length * proportion) - 1)] ?? 0
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
