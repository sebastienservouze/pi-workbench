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
  result?: ToolResult
  status: 'generating' | 'running' | 'interrupted'
}

export interface ToolCallPresentation {
  headerDetail?: { text: string; title: string; suffix?: string }
  pendingDetail?: string
}

export interface ReadContentDisplay {
  kind: 'code' | 'html' | 'markdown' | 'text'
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

/** Extrait chaque étape d’un appel d’outil afin de suivre ses paramètres bruts pendant leur génération. */
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

/** Applique une étape de streaming en conservant le JSON brut et l’identité finale de l’appel. */
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
    return {
      ...execution,
      ...update.call,
      id: update.call.id || execution.id,
      rawArgs: update.phase === 'delta' ? `${execution.rawArgs ?? ''}${update.delta}` : undefined,
      status: update.phase === 'end' ? 'running' as const : 'generating' as const,
    }
  })
  if (matched) return updated

  return [...executions, {
    ...update.call,
    contentIndex: update.contentIndex,
    id: update.call.id || draftId,
    rawArgs: update.phase === 'delta' ? update.delta : undefined,
    status: update.phase === 'end' ? 'running' : 'generating',
  }]
}

/** Fige les appels dont la génération n’a pas produit d’événement de fin. */
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

/** Extrait les remplacements valides fournis à l’outil d’édition. */
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
  return `${title}\nAppel : ${inputLength} caractères${outputLength === undefined ? '' : ` · Résultat : ${outputLength} caractères`}`
}

export function truncateToolText(text: string, maxLength = 140): { text: string; truncated: boolean } {
  if (text.length <= maxLength) return { text, truncated: false }
  return { text: `${text.slice(0, maxLength)}…`, truncated: true }
}

/** Limite une sortie à ses premières lignes en réservant une indication pour son contenu restant. */
export function toolTextPreview(text: string, maxLines = 4): { text: string; remainingLineCount: number } {
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n')
  const remainingLineCount = Math.max(0, lines.length - maxLines)
  if (remainingLineCount === 0) return { text, remainingLineCount }
  return { text: `${lines.slice(0, maxLines).join('\n')}…`, remainingLineCount }
}

/** Construit une URL file:// compatible avec les chemins Windows et les partages WSL. */
export function windowsFileUrl(path: string): string {
  const normalizedPath = path.replaceAll('\\', '/')
  return normalizedPath.startsWith('//') ? `file:${encodeURI(normalizedPath)}` : `file:///${encodeURI(normalizedPath)}`
}

export function toolCallPresentation(call: ToolCall, repositoryRoot?: string | null): ToolCallPresentation {
  return toolCallPresentations[call.name]?.(call.args, repositoryRoot) ?? {}
}

/** Retourne le chemin cible des outils qui manipulent directement un fichier. */
export function toolFilePath(args: unknown): string | null {
  return isObject(args) && typeof args.path === 'string' && args.path.length > 0 ? args.path : null
}

/** Détermine le rendu du fichier à partir de l'extension de son chemin. */
export function readContentDisplay(args: unknown): ReadContentDisplay {
  const path = toolFilePath(args)
  if (!path) return { kind: 'text' }

  const extension = path.match(/\.([^./]+)$/)?.[1]?.toLowerCase()
  if (extension === 'md' || extension === 'markdown') return { kind: 'markdown' }
  if (extension === 'htm' || extension === 'html') return { kind: 'html' }

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

/** Adapte Bash en plaçant sa commande dans l'en-tête et son timeout dans le statut. */
function bashPresentation(args: unknown): ToolCallPresentation {
  if (!isObject(args) || typeof args.command !== 'string') return {}

  const command = args.command
  const timeout = typeof args.timeout === 'number' && Number.isFinite(args.timeout) ? args.timeout : undefined
  return {
    headerDetail: { text: truncateToolText(command, 80).text, title: command },
    pendingDetail: timeout === undefined ? undefined : `timeout : ${timeout}s`,
  }
}

/** Affiche un chemin de fichier relatif au dépôt sans masquer un accès extérieur au dépôt. */
function filePresentation(args: unknown, repositoryRoot?: string | null): ToolCallPresentation {
  if (!isObject(args) || typeof args.path !== 'string') return {}

  const path = pathFromRepositoryRoot(args.path, repositoryRoot)
  return { headerDetail: { text: truncateToolText(path, 80).text, title: path } }
}

/** Expose le motif et son périmètre facultatif sans dupliquer la présentation des deux outils de recherche. */
function searchPresentation(args: unknown, repositoryRoot?: string | null): ToolCallPresentation {
  if (!isObject(args) || typeof args.pattern !== 'string') return {}

  const path = typeof args.path === 'string' ? pathFromRepositoryRoot(args.path, repositoryRoot) : undefined
  const detail = path ? `${args.pattern} · ${path}` : args.pattern
  return { headerDetail: { text: truncateToolText(detail, 80).text, title: detail } }
}

/** Complète le chemin lu avec une plage toujours visible, distincte du texte tronqué. */
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
