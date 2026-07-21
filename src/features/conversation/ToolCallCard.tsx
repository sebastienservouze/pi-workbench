import { memo, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { getWorkspaceFile } from '../../api.ts'
import { canHighlightFile } from './file-preview.ts'
import { editOperations, formatToolCallTooltip, formatToolData, readContentDisplay, toolCallPresentation, toolContentText, toolFilePath, type EditOperation } from './tool-calls.ts'

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('csharp', csharp)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('typescript', typescript)

export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown>{children}</ReactMarkdown>
}

/** Regroupe l'appel et son résultat afin que leur état visuel reste cohérent dans l'historique. */
export const ToolCallCard = memo(function ToolCallCard({ args, hasResult, id, name, repositoryRoot, resultContent, resultError, workspacePath }: {
  args: unknown
  hasResult: boolean
  id: string
  name: string
  repositoryRoot?: string | null
  resultContent?: unknown
  resultError?: boolean
  workspacePath: string
}) {
  const pending = !hasResult
  const [expanded, setExpanded] = useState(false)
  const [writtenContent, setWrittenContent] = useState<string>()
  const [writtenContentError, setWrittenContentError] = useState<string>()
  const [loadingWrittenContent, setLoadingWrittenContent] = useState(false)
  const [codeRendered, setCodeRendered] = useState(false)
  const input = formatToolData(args)
  const output = hasResult ? toolContentText(resultContent) : ''
  const displayedOutput = output || 'Aucune sortie.'
  const presentation = toolCallPresentation({ id, name, args }, repositoryRoot)
  const tooltip = formatToolCallTooltip(presentation.headerDetail?.title ?? input, input, hasResult ? displayedOutput : undefined)
  const filePath = name === 'read' || name === 'write' ? toolFilePath(args) : null
  const display = filePath ? readContentDisplay({ path: filePath }) : { kind: 'text' as const }
  const htmlFile = display.kind === 'html'
  const codeContent = name === 'write' ? writtenContent : displayedOutput
  const toggleExpanded = () => setExpanded((isExpanded) => !isExpanded)

  useEffect(() => {
    if (!expanded || display.kind !== 'code' || loadingWrittenContent || writtenContentError || codeRendered) return
    const timeout = window.setTimeout(() => setCodeRendered(true), 0)
    return () => window.clearTimeout(timeout)
  }, [codeRendered, display.kind, expanded, loadingWrittenContent, writtenContentError])

  /** Ouvre un fichier HTML dans un nouvel onglet local et expand les autres types dans l'historique. */
  const activate = () => {
    if (filePath && htmlFile) {
      const url = htmlFileUrl(workspacePath, filePath)
      if (url) {
        const tab = window.open(url, '_blank')
        if (tab) tab.opener = null
      }
      return
    }
    if (filePath && display.kind === 'code' && name === 'write' && writtenContent === undefined) {
      setExpanded(true)
      setLoadingWrittenContent(true)
      setWrittenContentError(undefined)
      void getWorkspaceFile(workspacePath, filePath).then((file) => setWrittenContent(file.content)).catch((cause: unknown) => setWrittenContentError(messageOf(cause))).finally(() => setLoadingWrittenContent(false))
      return
    }
    toggleExpanded()
  }

  const content = writtenContentError ?? codeContent ?? displayedOutput
  const contentError = resultError || Boolean(writtenContentError)
  const renderingCode = display.kind === 'code' && canHighlightFile(content) && expanded && !loadingWrittenContent && !writtenContentError && !codeRendered
  return <article className={`tool-call${contentError ? ' error' : ''}`}>
    <button aria-expanded={htmlFile ? undefined : hasResult ? expanded : undefined} className="tool-call-heading tool-call-tooltip" data-tooltip={tooltip} disabled={!hasResult} onClick={activate} type="button">
      <span aria-hidden="true">⌘</span>
      <span><strong aria-label={tooltip}>{name}</strong></span>
      {presentation.headerDetail && <span className="tool-call-command"><code aria-label={`Commande complète : ${presentation.headerDetail.title}`}>{presentation.headerDetail.text}</code></span>}
      {presentation.headerDetail?.suffix && <span className="tool-call-range"><code aria-label={`Plage lue : ${presentation.headerDetail.suffix}`}>{presentation.headerDetail.suffix}</code></span>}
      <small>
        {pending && <span aria-label="Outil en cours" className="spinner tool-call-spinner" role="status" />}
        {hasResult ? contentError ? 'Échec' : 'Terminé' : 'En cours…'}
        {pending && presentation.pendingDetail && ` · ${presentation.pendingDetail}`}
      </small>
    </button>
    {hasResult && !htmlFile && expanded && <ToolCallContent call={{ name, args }} content={content} error={contentError} onCollapse={() => setExpanded(false)} renderingCode={renderingCode || loadingWrittenContent} />}
  </article>
})

/** Affiche la sortie complète lorsque son appel a été développé et referme le bloc à son clic. */
function ToolCallContent({ call, content, error, onCollapse, renderingCode }: { call: { name: string; args: unknown }; content: string; error?: boolean; onCollapse: () => void; renderingCode: boolean }) {
  if (renderingCode) return <section className="tool-call-content tool-call-loading" role="status" onClick={onCollapse}><span aria-hidden="true" className="spinner" />Colorisation du fichier…</section>

  const edits = call.name === 'edit' && !error ? editOperations(call.args) : null
  if (edits) return <section className="tool-call-content" onClick={onCollapse}><ToolEditDiff edits={edits} /></section>

  const display = call.name === 'read' || call.name === 'write' ? readContentDisplay(call.args) : { kind: 'text' as const }
  if (display.kind === 'markdown') return <section className="tool-call-content tool-call-markdown" onClick={onCollapse}><Markdown>{content}</Markdown></section>
  if (display.kind === 'code' && canHighlightFile(content)) return <section className="tool-call-content" onClick={onCollapse}><SyntaxHighlighter className="tool-call-syntax" customStyle={{ background: 'transparent', margin: 0, padding: '9px 10px' }} language={display.language} PreTag="div" style={oneLight} wrapLongLines>{content}</SyntaxHighlighter></section>
  if (display.kind === 'code') return <section className="tool-call-content" onClick={onCollapse}><p className="tool-call-notice">Colorisation désactivée au-delà de 50 000 caractères.</p><pre>{content}</pre></section>
  return <section className="tool-call-content" onClick={onCollapse}><pre>{content}</pre></section>
}

/** Affiche chaque remplacement exact sous la forme compacte d'un diff unifié. */
function ToolEditDiff({ edits }: { edits: EditOperation[] }) {
  return <section className="tool-call-content tool-edit-diff">
    {edits.map((edit, index) => <div aria-label={`Édition ${index + 1}`} className="tool-edit-operation" key={index}>
      {diffLines(edit.oldText).map((line, lineIndex) => <div className="tool-edit-line removed" key={`removed-${lineIndex}`}><span aria-hidden="true">−</span><code>{line}</code></div>)}
      {diffLines(edit.newText).map((line, lineIndex) => <div className="tool-edit-line added" key={`added-${lineIndex}`}><span aria-hidden="true">+</span><code>{line}</code></div>)}
    </div>)}
  </section>
}

function diffLines(text: string): string[] {
  return text === '' ? [] : text.split('\n')
}


function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/** Construit l'URL file:// d'un document HTML dans le workspace pour l'ouvrir dans un nouvel onglet. */
function htmlFileUrl(workspacePath: string, path: string): string | null {
  const root = new URL(workspacePath.endsWith('/') ? workspacePath : `${workspacePath}/`, 'file:///')
  const target = new URL(path, root)
  return target.pathname.startsWith(root.pathname) ? target.href : null
}
