import type { JsonObject } from '../../../shared/types.ts'

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

export interface ToolCallUpdate {
  call: ToolCall
  contentIndex: number
  delta: string
  phase: 'start' | 'delta' | 'end'
}

export interface ToolExecution extends ToolCall {
  contentIndex?: number
  rawArgs?: string
  rawArgsLength?: number
  rawArgsTruncated?: boolean
  result?: ToolResult
  status: 'generating' | 'running' | 'interrupted'
}

export interface ToolCallPresentation {
  headerDetail?: { text: string; title: string; suffix?: string }
  pendingDetail?: string
}

export interface ReadContentDisplay {
  kind: 'code' | 'html' | 'markdown' | 'svg' | 'text'
  language?: string
}

export interface ToolEditChange {
  oldText: string
  newText: string
}

export function toolCallsInMessage(message: JsonObject): ToolCall[] {
  if (message.role !== 'assistant' || !Array.isArray(message.content)) return []

  return message.content.flatMap((part) => {
    const call = toolCallFromValue(part)
    return call ? [call] : []
  })
}

/** Extracts each step of a tool call to track its raw arguments while they are generated. */
export function toolCallInUpdate(event: JsonObject): ToolCallUpdate | null {
  if (event.type !== 'message_update' || !isObject(event.assistantMessageEvent)) return null
  const update = event.assistantMessageEvent
  if (update.type !== 'toolcall_start' && update.type !== 'toolcall_delta' && update.type !== 'toolcall_end') return null
  if (!Number.isSafeInteger(update.contentIndex) || (update.contentIndex as number) < 0) return null

  const call = update.type === 'toolcall_end'
    ? toolCallFromValue(update.toolCall)
    : toolCallFromPartial(update.partial, update.contentIndex as number)
  if (!call) return null

  return {
    call,
    contentIndex: update.contentIndex as number,
    delta: update.type === 'toolcall_delta' && typeof update.delta === 'string' ? update.delta : '',
    phase: update.type === 'toolcall_start' ? 'start' : update.type === 'toolcall_delta' ? 'delta' : 'end',
  }
}

/** Applies a streaming step while preserving raw JSON and the call's final identity. */
export function applyToolCallUpdate(executions: ToolExecution[], update: ToolCallUpdate, draftId: string): ToolExecution[] {
  if (update.phase === 'start') {
    const previousInterrupted = executions.map((execution) => execution.status === 'generating' && execution.contentIndex === update.contentIndex
      ? { ...execution, status: 'interrupted' as const }
      : execution)
    return [...previousInterrupted, {
      ...update.call,
      contentIndex: update.contentIndex,
      id: update.call.id || draftId,
      rawArgs: '',
      status: 'generating',
    }]
  }

  let matched = false
  const updated = executions.map((execution) => {
    if (matched || execution.status !== 'generating' || execution.contentIndex !== update.contentIndex) return execution
    matched = true
    if (update.phase === 'end') return { ...execution, ...update.call, rawArgs: undefined, rawArgsLength: undefined, rawArgsTruncated: undefined, status: 'running' as const }

    const rawArgsLength = (execution.rawArgsLength ?? execution.rawArgs?.length ?? 0) + update.delta.length
    if (execution.rawArgsTruncated) return { ...execution, rawArgsLength }

    const completeRawArgs = `${execution.rawArgs ?? ''}${update.delta}`
    const rawArgs = streamingArgumentsPreview(update.call.name, completeRawArgs)
    return {
      ...execution,
      ...update.call,
      id: update.call.id || execution.id,
      rawArgs,
      rawArgsLength,
      ...(rawArgs === completeRawArgs ? {} : { rawArgsTruncated: true }),
    }
  })
  if (matched) return updated

  return [...executions, {
    ...update.call,
    contentIndex: update.contentIndex,
    id: update.call.id || draftId,
    rawArgs: update.phase === 'delta' ? streamingArgumentsPreview(update.call.name, update.delta) : undefined,
    rawArgsLength: update.phase === 'delta' ? update.delta.length : undefined,
    ...(update.phase === 'delta' && streamingArgumentsPreview(update.call.name, update.delta) !== update.delta ? { rawArgsTruncated: true } : {}),
    status: update.phase === 'end' ? 'running' : 'generating',
  }]
}

const MAX_STREAMED_FILE_ARGUMENT_LENGTH = 400

function streamingArgumentsPreview(name: string, rawArgs: string): string {
  if ((name !== 'write' && name !== 'edit') || rawArgs.length <= MAX_STREAMED_FILE_ARGUMENT_LENGTH) return rawArgs
  return `${rawArgs.slice(0, MAX_STREAMED_FILE_ARGUMENT_LENGTH)}…`
}

/** Freezes calls whose generation produced no end event. */
export function interruptToolCallGeneration(executions: ToolExecution[]): ToolExecution[] {
  return executions.map((execution) => execution.status === 'generating'
    ? { ...execution, status: 'interrupted' }
    : execution)
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

/** Extracts valid replacements provided to the edit tool. */
export function toolEditChanges(args: unknown): ToolEditChange[] {
  if (!isObject(args) || !Array.isArray(args.edits)) return []
  return args.edits.flatMap((edit) => isObject(edit) && typeof edit.oldText === 'string' && typeof edit.newText === 'string'
    ? [{ oldText: edit.oldText, newText: edit.newText }]
    : [])
}

export function formatToolData(value: unknown): string {
  try { return JSON.stringify(value, null, 2) ?? String(value) } catch { return String(value) }
}

export function toolDataLength(value: unknown): number {
  try { return (JSON.stringify(value) ?? String(value)).length } catch { return String(value).length }
}

export function formatToolCallTooltip(title: string, inputLength: number, outputLength?: number): string {
  return `${title}\nCall: ${inputLength} characters${outputLength === undefined ? '' : ` · Result: ${outputLength} characters`}`
}

export function truncateToolText(text: string, maxLength = 140): { text: string; truncated: boolean } {
  if (text.length <= maxLength) return { text, truncated: false }
  return { text: `${text.slice(0, maxLength)}…`, truncated: true }
}

/** Limits output to its first lines while reserving an indicator for the remaining content. */
export function toolTextPreview(text: string, maxLines = 4): { text: string; remainingLineCount: number } {
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n')
  const remainingLineCount = Math.max(0, lines.length - maxLines)
  if (remainingLineCount === 0) return { text, remainingLineCount }
  return { text: `${lines.slice(0, maxLines).join('\n')}…`, remainingLineCount }
}

/** Builds a file:// URL compatible with Windows paths and WSL shares. */
export function windowsFileUrl(path: string): string {
  const normalizedPath = path.replaceAll('\\', '/')
  return normalizedPath.startsWith('//') ? `file:${encodeURI(normalizedPath)}` : `file:///${encodeURI(normalizedPath)}`
}

export function toolCallPresentation(call: ToolCall, repositoryRoot?: string | null): ToolCallPresentation {
  return toolCallPresentations[call.name]?.(call.args, repositoryRoot) ?? {}
}

/** Returns the target path for tools that manipulate a file directly. */
export function toolFilePath(args: unknown): string | null {
  return isObject(args) && typeof args.path === 'string' && args.path.length > 0 ? args.path : null
}

/** Determines file rendering from its path extension. */
export function readContentDisplay(args: unknown): ReadContentDisplay {
  const path = toolFilePath(args)
  if (!path) return { kind: 'text' }

  const extension = path.match(/\.([^./]+)$/)?.[1]?.toLowerCase()
  if (extension === 'md' || extension === 'markdown') return { kind: 'markdown' }
  if (extension === 'htm' || extension === 'html') return { kind: 'html' }
  if (extension === 'svg') return { kind: 'svg' }

  const language = extension ? languageByExtension[extension] : undefined
  return language ? { kind: 'code', language } : { kind: 'text' }
}

const languageByExtension: Record<string, string> = {
  bash: 'bash',
  cjs: 'javascript',
  cs: 'csharp',
  css: 'css',
  fish: 'bash',
  htm: 'markup',
  html: 'markup',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  mjs: 'javascript',
  sh: 'bash',
  ts: 'typescript',
  tsx: 'typescript',
  zsh: 'bash',
}

type ToolCallPresenter = (args: unknown, repositoryRoot?: string | null) => ToolCallPresentation

const toolCallPresentations: Record<string, ToolCallPresenter> = {
  bash: bashPresentation,
  edit: filePresentation,
  find: searchPresentation,
  grep: searchPresentation,
  read: readPresentation,
  write: filePresentation,
}

/** Adapts Bash by placing its command in the header and its timeout in the status. */
function bashPresentation(args: unknown): ToolCallPresentation {
  if (!isObject(args) || typeof args.command !== 'string') return {}

  const command = args.command
  const timeout = typeof args.timeout === 'number' && Number.isFinite(args.timeout) ? args.timeout : undefined
  return {
    headerDetail: { text: truncateToolText(command, 80).text, title: command },
    pendingDetail: timeout === undefined ? undefined : `timeout: ${timeout}s`,
  }
}

/** Displays a file path relative to the repository without hiding access outside it. */
function filePresentation(args: unknown, repositoryRoot?: string | null): ToolCallPresentation {
  if (!isObject(args) || typeof args.path !== 'string') return {}

  const path = pathFromRepositoryRoot(args.path, repositoryRoot)
  return { headerDetail: { text: truncateToolText(path, 80).text, title: path } }
}

/** Exposes the pattern and optional scope without duplicating the two search tools' presentation. */
function searchPresentation(args: unknown, repositoryRoot?: string | null): ToolCallPresentation {
  if (!isObject(args) || typeof args.pattern !== 'string') return {}

  const path = typeof args.path === 'string' ? pathFromRepositoryRoot(args.path, repositoryRoot) : undefined
  const detail = path ? `${args.pattern} · ${path}` : args.pattern
  return { headerDetail: { text: truncateToolText(detail, 80).text, title: detail } }
}

/** Completes the read path with an always-visible range distinct from truncated text. */
function readPresentation(args: unknown, repositoryRoot?: string | null): ToolCallPresentation {
  const presentation = filePresentation(args, repositoryRoot)
  if (!presentation.headerDetail || !isObject(args)) return presentation

  const range = readLineRange(args)
  return range ? { headerDetail: { ...presentation.headerDetail, suffix: range } } : presentation
}

function readLineRange(args: JsonObject): string | undefined {
  const offset = positiveInteger(args.offset)
  const limit = positiveInteger(args.limit)
  if (offset === undefined && limit === undefined) return undefined

  const start = offset ?? 1
  const end = limit === undefined ? '' : String(start + limit - 1)
  return `[${start}:${end}]`
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function pathFromRepositoryRoot(path: string, repositoryRoot?: string | null): string {
  if (!repositoryRoot) return path

  const root = repositoryRoot.replace(/\/+$/, '')
  if (path === root) return '.'
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

function toolCallFromValue(value: unknown): ToolCall | null {
  if (!isObject(value) || value.type !== 'toolCall' || typeof value.id !== 'string' || typeof value.name !== 'string') return null
  return { id: value.id, name: value.name, args: value.arguments }
}

function toolCallFromPartial(value: unknown, contentIndex: number): ToolCall | null {
  if (!isObject(value) || !Array.isArray(value.content)) return null
  return toolCallFromValue(value.content[contentIndex])
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
