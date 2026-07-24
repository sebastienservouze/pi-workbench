import { memo, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Tooltip } from '../../components/Tooltip.tsx'
import { getWorkspaceFile, getWorkspaceFilePath } from '../../api.ts'
import { fileContextDraft } from './context-session.ts'
import { canHighlightFile } from './file-preview.ts'
import { formatToolCallTooltip, formatToolData, readContentDisplay, toolCallPresentation, toolContentText, toolDataLength, toolEditChanges, toolFilePath, toolTextPreview, windowsFileUrl } from './tool-calls.ts'

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('csharp', csharp)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('typescript', typescript)

export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
}

/** Opens a session with a context draft without sending it immediately. */
export function ContextSessionButton({ onClick, onError }: { onClick: () => Promise<void>; onError?: (cause: unknown) => void }) {
  const [busy, setBusy] = useState(false)

  async function activate(): Promise<void> {
    setBusy(true)
    try {
      await onClick()
    } catch (cause) {
      onError?.(cause)
    } finally {
      setBusy(false)
    }
  }

  return <Tooltip label="Continue in a new session"><button aria-label="Continue in a new session" className="context-session-button" disabled={busy} onClick={() => void activate()} type="button">
    <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" /></svg>
  </button></Tooltip>
}

interface ToolCallCardProps {
  animateLiveChanges?: boolean
  args: unknown
  darkMode: boolean
  hasResult: boolean
  id: string
  interrupted?: boolean
  name: string
  onError: (cause: unknown) => void
  onStartSession: (draft: string) => Promise<void>
  rawArgs?: string
  rawArgsLength?: number
  rawArgsTruncated?: boolean
  repositoryRoot?: string | null
  resultContent?: unknown
  resultError?: boolean
  revealRequest?: number
  streaming?: boolean
  targeted?: boolean
  workspacePath: string
}

/** Displays the official card whose full result replaces the preview when expanded. */
export const ToolCallCard = memo(function ToolCallCard({ animateLiveChanges = false, args, darkMode, hasResult, id, interrupted = false, name, onError, onStartSession, rawArgs, rawArgsLength, rawArgsTruncated = false, repositoryRoot, resultContent, resultError, revealRequest, streaming = false, targeted = false, workspacePath }: ToolCallCardProps) {
  const pending = !hasResult
  const active = pending && !interrupted
  const filePath = name === 'read' || name === 'write' ? toolFilePath(args) : null
  const display = filePath ? readContentDisplay({ path: filePath }) : { kind: 'text' as const }
  const htmlFile = display.kind === 'html'
  const [expanded, setExpanded] = useState(name === 'edit')
  const [writtenContent, setWrittenContent] = useState<string>()
  const [writtenContentError, setWrittenContentError] = useState<string>()
  const [loadingWrittenContent, setLoadingWrittenContent] = useState(false)
  const [htmlOpenError, setHtmlOpenError] = useState<string>()
  const [codeRendered, setCodeRendered] = useState(false)
  const input = streaming || interrupted ? rawArgs ?? '' : formatToolData(args)
  const inputLength = streaming || interrupted ? rawArgsLength ?? input.length : toolDataLength(args)
  const output = hasResult ? toolContentText(resultContent) : ''
  const outputLength = output.length
  const displayedOutput = output || 'No output.'
  const presentation = toolCallPresentation({ id, name, args }, repositoryRoot)
  const tooltip = formatToolCallTooltip(presentation.headerDetail?.title ?? input, inputLength, hasResult ? outputLength : undefined)
  const resolvedSizeLabel = `Input: ${inputLength} characters. Output: ${outputLength} characters.`
  const content = htmlOpenError ?? writtenContentError ?? (name === 'write' && writtenContent === undefined && loadingWrittenContent ? 'Loading file…' : name === 'write' ? writtenContent ?? displayedOutput : displayedOutput)
  const contentError = resultError || Boolean(writtenContentError) || Boolean(htmlOpenError)
  const preview = toolTextPreview(content)
  const renderingCode = display.kind === 'code' && canHighlightFile(content) && expanded && !loadingWrittenContent && !writtenContentError && !codeRendered

  useEffect(() => {
    if (name !== 'write' || !filePath || !hasResult || resultError) return
    let cancelled = false
    setWrittenContent(undefined)
    setWrittenContentError(undefined)
    setLoadingWrittenContent(true)
    void getWorkspaceFile(workspacePath, filePath)
      .then((file) => { if (!cancelled) setWrittenContent(file.content) })
      .catch((cause: unknown) => { if (!cancelled) setWrittenContentError(messageOf(cause)) })
      .finally(() => { if (!cancelled) setLoadingWrittenContent(false) })
    return () => { cancelled = true }
  }, [filePath, hasResult, name, resultError, workspacePath])

  useEffect(() => {
    if (!expanded || display.kind !== 'code' || loadingWrittenContent || writtenContentError || codeRendered) return
    const timeout = window.setTimeout(() => setCodeRendered(true), 0)
    return () => window.clearTimeout(timeout)
  }, [codeRendered, display.kind, expanded, loadingWrittenContent, writtenContentError])

  useEffect(() => {
    if (revealRequest !== undefined && hasResult && !htmlFile) setExpanded(true)
  }, [hasResult, htmlFile, revealRequest])

  /** Opens HTML reads in the browser and expands other output in the history. */
  const activate = () => {
    if (filePath && htmlFile) {
      const tab = window.open('', '_blank')
      if (tab) tab.opener = null
      setHtmlOpenError(undefined)
      void getWorkspaceFilePath(workspacePath, filePath)
        .then(({ path }) => {
          if (tab) tab.location.href = windowsFileUrl(path)
        })
        .catch((cause: unknown) => {
          tab?.close()
          setHtmlOpenError(messageOf(cause))
        })
      return
    }
    setExpanded((isExpanded) => !isExpanded)
  }

  const hasBody = streaming || interrupted || hasResult

  return <article className={`tool-call${animateLiveChanges && streaming ? ' entering' : ''}${contentError ? ' error' : ''}${interrupted ? ' interrupted' : ''}${targeted ? ' conversation-target' : ''}`} data-tool-call-id={id}>
    <Tooltip label={tooltip}><button aria-expanded={htmlFile ? undefined : hasResult ? expanded : undefined} className="tool-call-heading" disabled={!hasResult} onClick={activate} type="button">
      <span aria-hidden="true">⌘</span>
      <span><strong aria-label={tooltip}>{name || 'Tool'}</strong></span>
      {presentation.headerDetail && <span className="tool-call-command"><code aria-label={`Full command: ${presentation.headerDetail.title}`}>{presentation.headerDetail.text}</code></span>}
      {presentation.headerDetail?.suffix && <span className="tool-call-range"><code aria-label={`Read range: ${presentation.headerDetail.suffix}`}>{presentation.headerDetail.suffix}</code></span>}
      <small aria-label={hasResult && !contentError ? resolvedSizeLabel : undefined}>
        {active && presentation.pendingDetail && `${presentation.pendingDetail} · `}
        {hasResult ? contentError ? 'Failed' : <span aria-hidden="true">↘ {inputLength} car. · ↗ {outputLength} car.</span> : interrupted ? 'Generation interrupted' : streaming ? 'Generating…' : 'In progress…'}
        {active && <span aria-label={streaming ? 'Arguments are being generated' : 'Tool in progress'} className="spinner tool-call-spinner" role="status" />}
      </small>
    </button></Tooltip>
    {filePath && (name === 'read' || name === 'write') && hasResult && <ContextSessionButton onClick={async () => {
      const { absolutePath } = await getWorkspaceFilePath(workspacePath, filePath)
      await onStartSession(fileContextDraft(absolutePath))
    }} onError={onError} />}
    <div className={`tool-call-body${hasBody ? ' visible' : ''}`}>
      <div>
        {(streaming || interrupted) && <>
          <pre aria-label={interrupted ? 'Interrupted JSON arguments' : 'JSON arguments in progress'} className="tool-call-raw-args">{rawArgs || 'Waiting for arguments…'}</pre>
          {streaming && rawArgsTruncated && <small className="tool-call-writing">Writing {rawArgsLength ?? 0} chars</small>}
        </>}
        {hasResult && <div className={animateLiveChanges ? 'tool-call-result entering' : 'tool-call-result'}>
          {expanded && !htmlFile
            ? <ToolCallContent call={{ name, args }} content={content} darkMode={darkMode} onCollapse={() => setExpanded(false)} renderingCode={renderingCode || loadingWrittenContent} showEditDiff={!contentError} />
            : <ToolCallPreview call={{ name, args }} content={preview.text} darkMode={darkMode} htmlFile={htmlFile} onClick={activate} remainingLineCount={preview.remainingLineCount} />}
        </div>}
      </div>
    </div>
  </article>
})

/** Displays a clickable, highlighted preview for supported code files. */
function ToolCallPreview({ call, content, darkMode, htmlFile, onClick, remainingLineCount }: { call: { name: string; args: unknown }; content: string; darkMode: boolean; htmlFile: boolean; onClick: () => void; remainingLineCount: number }) {
  const remainingLabel = `Click to view ${remainingLineCount} more ${remainingLineCount === 1 ? 'line' : 'lines'}`
  const display = call.name === 'read' || call.name === 'write' ? readContentDisplay(call.args) : { kind: 'text' as const }
  const highlightedCode = display.kind === 'code' && canHighlightFile(content)

  return <button className="tool-call-preview" onClick={onClick} type="button">
    {highlightedCode
      ? <SyntaxHighlighter className="tool-call-syntax" customStyle={{ background: 'transparent', margin: 0, padding: '9px 10px 4px' }} language={display.language} PreTag="div" style={darkMode ? oneDark : oneLight} wrapLongLines>{content}</SyntaxHighlighter>
      : <pre>{content}</pre>}
    {remainingLineCount > 0 && <span>{remainingLabel}</span>}
    {htmlFile && <span>Click to open in browser</span>}
  </button>
}

/** Displays the full result in its appropriate format instead of the preview. */
function ToolCallContent({ call, content, darkMode, onCollapse, renderingCode, showEditDiff }: { call: { name: string; args: unknown }; content: string; darkMode: boolean; onCollapse: () => void; renderingCode: boolean; showEditDiff: boolean }) {
  if (renderingCode) return <section className="tool-call-content tool-call-loading" role="status" onClick={onCollapse}><span aria-hidden="true" className="spinner" />Highlighting file…</section>

  const changes = showEditDiff && call.name === 'edit' ? toolEditChanges(call.args) : []
  if (changes.length > 0) return <ToolCallEditDiff changes={changes} onCollapse={onCollapse} />

  const display = call.name === 'read' || call.name === 'write' ? readContentDisplay(call.args) : { kind: 'text' as const }
  if (display.kind === 'markdown') return <section className="tool-call-content tool-call-markdown" onClick={onCollapse}><Markdown>{content}</Markdown></section>
  if (display.kind === 'svg') return <section className="tool-call-content tool-call-svg" onClick={onCollapse}><img alt={`Rendered SVG: ${toolFilePath(call.args) ?? 'file'}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`} /></section>
  if (display.kind === 'code' && canHighlightFile(content)) return <section className="tool-call-content" onClick={onCollapse}><SyntaxHighlighter className="tool-call-syntax" customStyle={{ background: 'transparent', margin: 0, padding: '9px 10px' }} language={display.language} PreTag="div" style={darkMode ? oneDark : oneLight} wrapLongLines>{content}</SyntaxHighlighter></section>
  if (display.kind === 'code') return <section className="tool-call-content" onClick={onCollapse}><p className="tool-call-notice">Highlighting disabled beyond 50,000 characters.</p><pre>{content}</pre></section>
  return <section className="tool-call-content" onClick={onCollapse}><pre>{content}</pre></section>
}


/** Displays each replacement from an edit call in a separate diff block. */
function ToolCallEditDiff({ changes, onCollapse }: { changes: ReturnType<typeof toolEditChanges>; onCollapse: () => void }) {
  return <section className="tool-call-content tool-call-edit-diff" onClick={onCollapse}>
    {changes.map((change, index) => <section className="tool-call-edit-change" key={index}>
      <h4>Change {index + 1}</h4>
      <div className="tool-call-edit-line removed"><i aria-hidden="true">−</i><pre>{change.oldText}</pre></div>
      <div className="tool-call-edit-line added"><i aria-hidden="true">+</i><pre>{change.newText}</pre></div>
    </section>)}
  </section>
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
