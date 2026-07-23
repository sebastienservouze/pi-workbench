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
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { getWorkspaceFile, getWorkspaceFilePath } from '../../api.ts'
import { canHighlightFile } from './file-preview.ts'
import { formatToolCallTooltip, formatToolData, readContentDisplay, toolCallPresentation, toolContentText, toolEditChanges, toolFilePath, toolTextPreview, windowsFileUrl } from './tool-calls.ts'

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

/** Affiche un appel d’outil dont le résultat complet remplace l’aperçu au dépliage. */
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
  const filePath = name === 'read' || name === 'write' ? toolFilePath(args) : null
  const display = filePath ? readContentDisplay({ path: filePath }) : { kind: 'text' as const }
  const htmlFile = display.kind === 'html'
  const [expanded, setExpanded] = useState(name === 'edit')
  const [writtenContent, setWrittenContent] = useState<string>()
  const [writtenContentError, setWrittenContentError] = useState<string>()
  const [loadingWrittenContent, setLoadingWrittenContent] = useState(false)
  const [htmlOpenError, setHtmlOpenError] = useState<string>()
  const [codeRendered, setCodeRendered] = useState(false)
  const input = formatToolData(args)
  const output = hasResult ? toolContentText(resultContent) : ''
  const displayedOutput = output || 'Aucune sortie.'
  const presentation = toolCallPresentation({ id, name, args }, repositoryRoot)
  const tooltip = formatToolCallTooltip(presentation.headerDetail?.title ?? input, input, hasResult ? displayedOutput : undefined)
  const content = htmlOpenError ?? writtenContentError ?? (name === 'write' && writtenContent === undefined && loadingWrittenContent ? 'Chargement du fichier…' : name === 'write' ? writtenContent ?? displayedOutput : displayedOutput)
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

  /** Ouvre les lectures HTML dans le navigateur et développe les autres sorties dans l'historique. */
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
    {hasResult && (expanded && !htmlFile
      ? <ToolCallContent call={{ name, args }} content={content} onCollapse={() => setExpanded(false)} renderingCode={renderingCode || loadingWrittenContent} showEditDiff={!contentError} />
      : <ToolCallPreview call={{ name, args }} content={preview.text} htmlFile={htmlFile} onClick={activate} remainingLineCount={preview.remainingLineCount} />
    )}
  </article>
})

/** Affiche un aperçu cliquable, colorisé pour les fichiers de code pris en charge. */
function ToolCallPreview({ call, content, htmlFile, onClick, remainingLineCount }: { call: { name: string; args: unknown }; content: string; htmlFile: boolean; onClick: () => void; remainingLineCount: number }) {
  const remainingLabel = `Cliquer pour voir ${remainingLineCount} ${remainingLineCount === 1 ? 'ligne' : 'lignes'} de plus`
  const display = call.name === 'read' || call.name === 'write' ? readContentDisplay(call.args) : { kind: 'text' as const }
  const highlightedCode = display.kind === 'code' && canHighlightFile(content)

  return <button className="tool-call-preview" onClick={onClick} type="button">
    {highlightedCode
      ? <SyntaxHighlighter className="tool-call-syntax" customStyle={{ background: 'transparent', margin: 0, padding: '9px 10px 4px' }} language={display.language} PreTag="div" style={oneLight} wrapLongLines>{content}</SyntaxHighlighter>
      : <pre>{content}</pre>}
    {remainingLineCount > 0 && <span>{remainingLabel}</span>}
    {htmlFile && <span>Cliquer pour ouvrir dans le navigateur</span>}
  </button>
}

/** Affiche le résultat complet dans son format adapté à la place de l’aperçu. */
function ToolCallContent({ call, content, onCollapse, renderingCode, showEditDiff }: { call: { name: string; args: unknown }; content: string; onCollapse: () => void; renderingCode: boolean; showEditDiff: boolean }) {
  if (renderingCode) return <section className="tool-call-content tool-call-loading" role="status" onClick={onCollapse}><span aria-hidden="true" className="spinner" />Colorisation du fichier…</section>

  const changes = showEditDiff && call.name === 'edit' ? toolEditChanges(call.args) : []
  if (changes.length > 0) return <ToolCallEditDiff changes={changes} onCollapse={onCollapse} />

  const display = call.name === 'read' || call.name === 'write' ? readContentDisplay(call.args) : { kind: 'text' as const }
  if (display.kind === 'markdown') return <section className="tool-call-content tool-call-markdown" onClick={onCollapse}><Markdown>{content}</Markdown></section>
  if (display.kind === 'code' && canHighlightFile(content)) return <section className="tool-call-content" onClick={onCollapse}><SyntaxHighlighter className="tool-call-syntax" customStyle={{ background: 'transparent', margin: 0, padding: '9px 10px' }} language={display.language} PreTag="div" style={oneLight} wrapLongLines>{content}</SyntaxHighlighter></section>
  if (display.kind === 'code') return <section className="tool-call-content" onClick={onCollapse}><p className="tool-call-notice">Colorisation désactivée au-delà de 50 000 caractères.</p><pre>{content}</pre></section>
  return <section className="tool-call-content" onClick={onCollapse}><pre>{content}</pre></section>
}


/** Affiche chaque remplacement d’un appel edit dans un bloc de diff distinct. */
function ToolCallEditDiff({ changes, onCollapse }: { changes: ReturnType<typeof toolEditChanges>; onCollapse: () => void }) {
  return <section className="tool-call-content tool-call-edit-diff" onClick={onCollapse}>
    {changes.map((change, index) => <section className="tool-call-edit-change" key={index}>
      <h4>Modification {index + 1}</h4>
      <div className="tool-call-edit-line removed"><i aria-hidden="true">−</i><pre>{change.oldText}</pre></div>
      <div className="tool-call-edit-line added"><i aria-hidden="true">+</i><pre>{change.newText}</pre></div>
    </section>)}
  </section>
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
