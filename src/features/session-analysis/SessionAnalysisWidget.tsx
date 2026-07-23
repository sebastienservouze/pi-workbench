import { useMemo, useState } from 'react'
import { formatTokens, formatTurnCost } from '../conversation/message-usage.ts'
import type { AnalyzedToolCall, SessionAnalysis, SessionAnalysisTarget } from './session-analysis.ts'

type ToolRanking = 'duration' | 'failure' | 'output'

/** Présente les mesures déterministes de la session et relie chaque anomalie à la conversation. */
export function SessionAnalysisWidget({ analysis, onNavigate }: { analysis: SessionAnalysis; onNavigate: (target: SessionAnalysisTarget) => void }) {
  const [toolRanking, setToolRanking] = useState<ToolRanking>('output')
  const costlyRequests = useMemo(() => [...analysis.requests]
    .filter((request) => request.modelCallCount > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5), [analysis.requests])
  const rankedCalls = useMemo(() => [...analysis.toolCalls]
    .filter((call) => toolRanking === 'duration' ? call.durationMs !== undefined : toolRanking === 'failure' ? call.isError : true)
    .sort((a, b) => toolValue(b, toolRanking) - toolValue(a, toolRanking))
    .slice(0, 8), [analysis.toolCalls, toolRanking])
  const failureRate = analysis.totalToolCalls > 0 ? analysis.failedToolCalls / analysis.totalToolCalls : 0
  const completedRequestCostAvailable = analysis.requests.some((request) => request.complete && request.modelCallCount > 0)

  return <div className="session-analysis">
    <dl className="analysis-summary">
      <Metric label="Coût total" value={analysis.costAvailable ? formatTurnCost(analysis.totalCost) : '—'} />
      <Metric label="Coût moyen" value={completedRequestCostAvailable ? formatTurnCost(analysis.averageRequestCost) : '—'} />
      <Metric label="Appels outils" value={String(analysis.totalToolCalls)} />
      <Metric label="Échecs" value={`${analysis.failedToolCalls} · ${formatPercent(failureRate)}`} danger={analysis.failedToolCalls > 0} />
    </dl>

    {analysis.contextPercent !== undefined && <section className="analysis-context" aria-label="Utilisation du contexte">
      <div><strong>Contexte</strong><span>{formatPercent(analysis.contextPercent / 100)}</span></div>
      <progress aria-label={`${analysis.contextPercent.toFixed(1)} % du contexte utilisé`} max="100" value={analysis.contextPercent} />
    </section>}

    <dl className="analysis-tokens">
      <div><dt>Cache miss</dt><dd>{formatAnalysisTokens(analysis.tokens.cacheMiss, analysis.tokensAvailable)}</dd></div>
      <div><dt>Cache read</dt><dd>{formatAnalysisTokens(analysis.tokens.cacheRead, analysis.tokensAvailable)}</dd></div>
      <div><dt>Cache write</dt><dd>{formatAnalysisTokens(analysis.tokens.cacheWrite, analysis.tokensAvailable)}</dd></div>
      <div><dt>Output</dt><dd>{formatAnalysisTokens(analysis.tokens.output, analysis.tokensAvailable)}</dd></div>
      <div><dt>Médiane</dt><dd>{completedRequestCostAvailable ? formatTurnCost(analysis.medianRequestCost) : '—'}</dd></div>
    </dl>

    {analysis.unattributedCost > 0.000001 && <p className="analysis-note"><strong>{formatTurnCost(analysis.unattributedCost)}</strong> non attribué aux requêtes visibles.</p>}

    <section className="analysis-section">
      <header><h2>Requêtes coûteuses</h2><span>coût</span></header>
      {costlyRequests.length > 0 ? <ol className="analysis-ranking">
        {costlyRequests.map((request) => <li key={request.messageIndex}>
          <button disabled={request.messageIndex < 0} onClick={() => onNavigate({ kind: 'message', index: request.messageIndex })} type="button">
            <span><strong>{request.title}</strong><small>{request.modelCallCount} appel{request.modelCallCount > 1 ? 's' : ''} modèle · {request.toolCalls.length} outil{request.toolCalls.length > 1 ? 's' : ''}{request.durationMs !== undefined && ` · ${formatDuration(request.durationMs)}`}</small></span>
            <b>{formatTurnCost(request.cost)}</b>
          </button>
        </li>)}
      </ol> : <EmptyState>Les coûts apparaîtront après la première réponse.</EmptyState>}
    </section>

    <section className="analysis-section">
      <header><h2>Appels consommateurs</h2><select aria-label="Classer les appels d’outils" onChange={(event) => setToolRanking(event.target.value as ToolRanking)} value={toolRanking}><option value="output">sortie</option><option value="duration">durée observée</option><option value="failure">échecs</option></select></header>
      {rankedCalls.length > 0 ? <ol className="analysis-ranking tool-ranking">
        {rankedCalls.map((call) => <ToolCallRow call={call} key={call.id} metric={toolRanking} onNavigate={onNavigate} />)}
      </ol> : <EmptyState>{toolRanking === 'duration' ? 'Les durées sont mesurées pendant cette ouverture du Workbench.' : toolRanking === 'failure' ? 'Aucun échec explicite dans cette session.' : 'Aucun appel d’outil dans cette session.'}</EmptyState>}
    </section>

    {analysis.tools.length > 0 && <section className="analysis-section">
      <header><h2>Répartition</h2><span>appels · échecs</span></header>
      <ul className="analysis-tools">
        {analysis.tools.map((tool) => <li key={tool.name}><code>{tool.name}</code><span>{tool.count}{tool.failed > 0 && <b> · {tool.failed}</b>}</span></li>)}
      </ul>
    </section>}
  </div>
}

function Metric({ danger = false, label, value }: { danger?: boolean; label: string; value: string }) {
  return <div className={danger ? 'danger' : undefined}><dt>{label}</dt><dd>{value}</dd></div>
}

/** Rend un appel classé et conserve sa cible de navigation dans la conversation. */
function ToolCallRow({ call, metric, onNavigate }: { call: AnalyzedToolCall; metric: ToolRanking; onNavigate: (target: SessionAnalysisTarget) => void }) {
  return <li>
    <button onClick={() => onNavigate({ kind: 'tool', id: call.id })} type="button">
      <span><strong><code>{call.name}</code>{call.isError && <i className="error">Échec</i>}{call.pending && <i>En cours</i>}</strong><small>{formatCharacters(call.inputLength)} en entrée · {formatCharacters(call.outputLength)} en sortie</small></span>
      <b>{metric === 'duration' ? formatDuration(call.durationMs ?? 0) : metric === 'failure' ? 'échec' : formatCharacters(call.outputLength)}</b>
    </button>
  </li>
}

function EmptyState({ children }: { children: string }) {
  return <p className="analysis-empty">{children}</p>
}

function toolValue(call: AnalyzedToolCall, metric: ToolRanking): number {
  return metric === 'duration' ? call.durationMs ?? 0 : call.outputLength
}

function formatAnalysisTokens(value: number, available: boolean): string {
  return available ? formatTokens(value) : '—'
}

function formatCharacters(value: number): string {
  return value >= 1000 ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value / 1000)} k car.` : `${value} car.`
}

function formatDuration(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value / 1000)} s`
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }).format(value)
}
