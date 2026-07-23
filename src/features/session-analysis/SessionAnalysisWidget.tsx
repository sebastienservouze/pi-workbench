import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatTokens, formatTurnCost } from '../conversation/message-usage.ts'
import type { AnalyzedToolCall, AnalyzedTurn, SessionAnalysis, SessionAnalysisTarget, ToolSummary } from './session-analysis.ts'

type ToolRanking = 'duration' | 'failure' | 'output'
type ToolUsageRanking = 'duration' | 'input' | 'output'

/** Présente les mesures déterministes de la session et relie chaque anomalie à la conversation. */
export function SessionAnalysisWidget({ analysis, onNavigate }: { analysis: SessionAnalysis; onNavigate: (target: SessionAnalysisTarget) => void }) {
  const [toolRanking, setToolRanking] = useState<ToolRanking>('output')
  const [toolUsageRanking, setToolUsageRanking] = useState<ToolUsageRanking>('output')
  const costlyRequests = useMemo(() => [...analysis.requests]
    .filter((request) => request.modelCallCount > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5), [analysis.requests])
  const rankedCalls = useMemo(() => [...analysis.toolCalls]
    .filter((call) => toolRanking === 'duration' ? call.durationMs !== undefined : toolRanking === 'failure' ? call.isError : true)
    .sort((a, b) => toolValue(b, toolRanking) - toolValue(a, toolRanking))
    .slice(0, 8), [analysis.toolCalls, toolRanking])
  const rankedTools = useMemo(() => [...analysis.tools]
    .filter((tool) => toolUsageRanking !== 'duration' || tool.measuredDurationCount > 0)
    .sort((a, b) => toolSummaryValue(b, toolUsageRanking) - toolSummaryValue(a, toolUsageRanking)), [analysis.tools, toolUsageRanking])
  const maxToolUsage = toolSummaryValue(rankedTools[0], toolUsageRanking)
  const failureRate = analysis.totalToolCalls > 0 ? analysis.failedToolCalls / analysis.totalToolCalls : 0
  const turnCostAvailable = analysis.turnCount > 0

  return <div className="session-analysis">
    <dl className="analysis-summary">
      <Metric label="Coût total" value={analysis.costAvailable ? formatTurnCost(analysis.totalCost) : '—'} />
      <Metric label="Coût moyen / tour" value={turnCostAvailable ? formatTurnCost(analysis.averageTurnCost) : '—'} />
      <Metric label="Tours" value={String(analysis.turnCount)} />
      <Metric label="Outils moyens / tour" value={turnCostAvailable ? formatAverage(analysis.averageToolCallsPerTurn) : '—'} />
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
      <div><dt>Médiane</dt><dd>{turnCostAvailable ? formatTurnCost(analysis.medianTurnCost) : '—'}</dd></div>
    </dl>

    {analysis.unattributedCost > 0.000001 && <p className="analysis-note"><strong>{formatTurnCost(analysis.unattributedCost)}</strong> non attribué aux requêtes visibles.</p>}

    <section className="analysis-section">
      <header><h2>Coût par tour assistant</h2><span>chronologique</span></header>
      {analysis.turns.length > 0
        ? <TurnCostChart onNavigate={onNavigate} turns={analysis.turns} />
        : <EmptyState>Les coûts apparaîtront après la première réponse.</EmptyState>}
    </section>

    <section className="analysis-section">
      <header><h2>Usage cumulé par outil</h2><select aria-label="Classer l’usage cumulé des outils" onChange={(event) => setToolUsageRanking(event.target.value as ToolUsageRanking)} value={toolUsageRanking}><option value="output">sortie cumulée</option><option value="input">entrée cumulée</option><option value="duration">durée cumulée</option></select></header>
      {rankedTools.length > 0 ? <ol className="tool-usage-ranking">
        {rankedTools.map((tool) => <ToolUsageRow key={tool.name} maxValue={maxToolUsage} metric={toolUsageRanking} tool={tool} />)}
      </ol> : <EmptyState>{toolUsageRanking === 'duration' ? 'Les durées sont mesurées pendant cette ouverture du Workbench.' : 'Aucun appel d’outil dans cette session.'}</EmptyState>}
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

    <section className="analysis-section">
      <header><h2>Tours utilisateur coûteux</h2><span>coût</span></header>
      {costlyRequests.length > 0 ? <ol className="analysis-ranking">
        {costlyRequests.map((request) => <li key={request.messageIndex}>
          <button disabled={request.messageIndex < 0} onClick={() => onNavigate({ kind: 'message', index: request.messageIndex })} type="button">
            <span><strong>{request.title}</strong><small>{request.modelCallCount} appel{request.modelCallCount > 1 ? 's' : ''} modèle · {request.toolCalls.length} outil{request.toolCalls.length > 1 ? 's' : ''}{request.durationMs !== undefined && ` · ${formatDuration(request.durationMs)}`}</small></span>
            <b>{formatTurnCost(request.cost)}</b>
          </button>
        </li>)}
      </ol> : <EmptyState>Les coûts apparaîtront après la première réponse.</EmptyState>}
    </section>
  </div>
}

function Metric({ danger = false, label, value }: { danger?: boolean; label: string; value: string }) {
  return <div className={danger ? 'danger' : undefined}><dt>{label}</dt><dd>{value}</dd></div>
}

/** Trace tous les coûts dans l’ordre et conserve chaque tour comme cible de navigation accessible. */
function TurnCostChart({ onNavigate, turns }: { onNavigate: (target: SessionAnalysisTarget) => void; turns: AnalyzedTurn[] }) {
  const chartScrollRef = useRef<HTMLDivElement>(null)
  const height = 178
  const padding = { top: 14, right: 16, bottom: 30, left: 12 }
  const width = Math.max(248, padding.left + padding.right + (turns.length - 1) * 30)
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const maxCost = Math.max(...turns.map((turn) => turn.cost))
  const points = turns.map((turn, index) => ({
    turn,
    x: turns.length === 1 ? padding.left + plotWidth / 2 : padding.left + index * plotWidth / (turns.length - 1),
    y: padding.top + plotHeight * (1 - (maxCost > 0 ? turn.cost / maxCost : 0)),
  }))
  const linePoints = points.map(({ x, y }) => `${x},${y}`).join(' ')
  const areaPoints = `${padding.left},${padding.top + plotHeight} ${linePoints} ${width - padding.right},${padding.top + plotHeight}`
  const yTicks = (maxCost > 0 ? [0, 0.5, 1] : [1]).map((ratio) => ({
    label: formatTurnCost(maxCost * (1 - ratio)),
    y: padding.top + plotHeight * ratio,
  }))

  useLayoutEffect(() => {
    if (chartScrollRef.current) chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth
  }, [turns.length])

  return <div className="turn-cost-chart-frame">
    <div aria-hidden="true" className="chart-y-axis">
      {yTicks.map((tick) => <span key={tick.y} style={{ top: tick.y + 2 }}>{tick.label}</span>)}
    </div>
    <div className="turn-cost-chart-scroll" ref={chartScrollRef}>
      <svg aria-label="Coût de chaque tour assistant, dans l’ordre chronologique" className="turn-cost-chart" role="group" style={{ width }} viewBox={`0 0 ${width} ${height}`}>
      {yTicks.map((tick) => <line className="chart-grid" key={tick.y} x1={padding.left} x2={width - padding.right} y1={tick.y} y2={tick.y} />)}
      {points.length > 1 && <polygon className="chart-area" points={areaPoints} />}
      {points.length > 1 && <polyline className="chart-line" points={linePoints} />}
      {points.map(({ turn, x, y }) => {
        const tooltipWidth = 124
        const tooltipX = Math.min(width - padding.right - tooltipWidth, Math.max(padding.left, x - tooltipWidth / 2))
        const tooltipY = y < padding.top + 48 ? y + 13 : y - 47
        return <g
          aria-label={`Tour ${turn.number}, ${formatTurnCost(turn.cost)}, ${turn.toolCallCount} outil${turn.toolCallCount !== 1 ? 's' : ''}`}
          className="chart-point"
          key={turn.messageIndex}
          onClick={() => onNavigate({ kind: 'turn', index: turn.messageIndex })}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onNavigate({ kind: 'turn', index: turn.messageIndex })
          }}
          role="button"
          tabIndex={0}
        >
          <circle className="chart-point-hit" cx={x} cy={y} r="11" />
          <circle className="chart-point-dot" cx={x} cy={y} r="3.5" />
          <text className="chart-x-label" x={x} y={height - 9}>{turn.number}</text>
          <g aria-hidden="true" className="chart-tooltip" transform={`translate(${tooltipX} ${tooltipY})`}>
            <rect height="38" rx="6" width={tooltipWidth} />
            <text x="10" y="15"><tspan className="chart-tooltip-cost">{formatTurnCost(turn.cost)}</tspan><tspan className="chart-tooltip-tools" x="10" dy="14">{turn.toolCallCount} outil{turn.toolCallCount !== 1 ? 's' : ''} appelé{turn.toolCallCount !== 1 ? 's' : ''}</tspan></text>
          </g>
        </g>
      })}
        <text className="chart-axis-title" x={padding.left + plotWidth / 2} y={height - 1}>Tour</text>
      </svg>
    </div>
  </div>
}

/** Compare les volumes cumulés d’un type d’outil sans leur attribuer de coût monétaire. */
function ToolUsageRow({ maxValue, metric, tool }: { maxValue: number; metric: ToolUsageRanking; tool: ToolSummary }) {
  const value = toolSummaryValue(tool, metric)
  const calls = `${tool.count} appel${tool.count !== 1 ? 's' : ''}`
  const measured = metric === 'duration' && tool.measuredDurationCount < tool.count
    ? ` · ${tool.measuredDurationCount}/${tool.count} durée${tool.measuredDurationCount !== 1 ? 's' : ''} mesurée${tool.measuredDurationCount !== 1 ? 's' : ''}`
    : ''
  const failures = tool.failed > 0 ? ` · ${tool.failed} échec${tool.failed > 1 ? 's' : ''}` : ''

  return <li>
    <div><code>{tool.name}</code><b>{metric === 'duration' ? formatDuration(value) : formatCharacters(value)}</b></div>
    <span aria-hidden="true" className="tool-usage-bar"><i style={{ width: `${maxValue > 0 ? value / maxValue * 100 : 0}%` }} /></span>
    <small>{calls}{measured}{failures}</small>
  </li>
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

function toolSummaryValue(tool: ToolSummary | undefined, metric: ToolUsageRanking): number {
  return metric === 'duration' ? tool?.durationMs ?? 0 : metric === 'input' ? tool?.inputLength ?? 0 : tool?.outputLength ?? 0
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

function formatAverage(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)
}
