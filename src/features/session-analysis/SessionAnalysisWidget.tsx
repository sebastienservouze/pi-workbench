import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatTokens, formatTurnCost } from '../conversation/message-usage.ts'
import type { AnalyzedToolCall, AnalyzedTurn, SessionAnalysis, SessionAnalysisTarget, ToolSummary } from './session-analysis.ts'

type ToolRanking = 'duration' | 'failure' | 'output'
type ToolUsageRanking = 'duration' | 'input' | 'output'

/** Presents deterministic session metrics and links each anomaly to the conversation. */
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
      <Metric label="Total cost" value={analysis.costAvailable ? formatTurnCost(analysis.totalCost) : '—'} />
      <Metric label="Average cost / turn" value={turnCostAvailable ? formatTurnCost(analysis.averageTurnCost) : '—'} />
      <Metric label="Turns" value={String(analysis.turnCount)} />
      <Metric label="Average tools / turn" value={turnCostAvailable ? formatAverage(analysis.averageToolCallsPerTurn) : '—'} />
      <Metric label="Tool calls" value={String(analysis.totalToolCalls)} />
      <Metric label="Failures" value={`${analysis.failedToolCalls} · ${formatPercent(failureRate)}`} danger={analysis.failedToolCalls > 0} />
    </dl>

    <section className="analysis-context" aria-label="Context usage">
      <header><strong>Context</strong>{analysis.contextPercent !== undefined && <span>{formatPercent(analysis.contextPercent / 100)}</span>}</header>
      {analysis.contextPercent !== undefined && <progress aria-label={`${analysis.contextPercent.toFixed(1)}% of context used`} max="100" value={analysis.contextPercent} />}
      <dl className="analysis-tokens">
        <div><dt>Cache miss</dt><dd>{formatAnalysisTokens(analysis.tokens.cacheMiss, analysis.tokensAvailable)}</dd></div>
        <div><dt>Cache read</dt><dd>{formatAnalysisTokens(analysis.tokens.cacheRead, analysis.tokensAvailable)}</dd></div>
        <div><dt>Output</dt><dd>{formatAnalysisTokens(analysis.tokens.output, analysis.tokensAvailable)}</dd></div>
        <div><dt>Median</dt><dd>{turnCostAvailable ? formatTurnCost(analysis.medianTurnCost) : '—'}</dd></div>
      </dl>
      {analysis.turns.length > 0 && <TokenUsageChart onNavigate={onNavigate} turns={analysis.turns} />}
    </section>

    {analysis.unattributedCost > 0.000001 && <p className="analysis-note"><strong>{formatTurnCost(analysis.unattributedCost)}</strong> not attributed to visible requests.</p>}

    <section className="analysis-section">
      <header><h2>Cost per assistant turn</h2><span>chronological</span></header>
      {analysis.turns.length > 0
        ? <TurnCostChart onNavigate={onNavigate} turns={analysis.turns} />
        : <EmptyState>Costs will appear after the first response.</EmptyState>}
    </section>

    <section className="analysis-section">
      <header><h2>Cumulative usage by tool</h2><select aria-label="Rank cumulative tool usage" onChange={(event) => setToolUsageRanking(event.target.value as ToolUsageRanking)} value={toolUsageRanking}><option value="output">cumulative output</option><option value="input">cumulative input</option><option value="duration">cumulative duration</option></select></header>
      {rankedTools.length > 0 ? <ol className="tool-usage-ranking">
        {rankedTools.map((tool) => <ToolUsageRow key={tool.name} maxValue={maxToolUsage} metric={toolUsageRanking} tool={tool} />)}
      </ol> : <EmptyState>{toolUsageRanking === 'duration' ? 'Durations are measured during this Workbench session.' : 'No tool calls in this session.'}</EmptyState>}
    </section>

    <section className="analysis-section">
      <header><h2>Costliest calls</h2><select aria-label="Rank tool calls" onChange={(event) => setToolRanking(event.target.value as ToolRanking)} value={toolRanking}><option value="output">sortie</option><option value="duration">observed duration</option><option value="failure">failures</option></select></header>
      {rankedCalls.length > 0 ? <ol className="analysis-ranking tool-ranking">
        {rankedCalls.map((call) => <ToolCallRow call={call} key={call.id} metric={toolRanking} onNavigate={onNavigate} />)}
      </ol> : <EmptyState>{toolRanking === 'duration' ? 'Durations are measured during this Workbench session.' : toolRanking === 'failure' ? 'No explicit failures in this session.' : 'No tool calls in this session.'}</EmptyState>}
    </section>

    {analysis.tools.length > 0 && <section className="analysis-section">
      <header><h2>Distribution</h2><span>calls · failures</span></header>
      <ul className="analysis-tools">
        {analysis.tools.map((tool) => <li key={tool.name}><code>{tool.name}</code><span>{tool.count}{tool.failed > 0 && <b> · {tool.failed}</b>}</span></li>)}
      </ul>
    </section>}

    <section className="analysis-section">
      <header><h2>Costliest user turns</h2><span>cost</span></header>
      {costlyRequests.length > 0 ? <ol className="analysis-ranking">
        {costlyRequests.map((request) => <li key={request.messageIndex}>
          <button disabled={request.messageIndex < 0} onClick={() => onNavigate({ kind: 'message', index: request.messageIndex })} type="button">
            <span><strong>{request.title}</strong><small>{request.modelCallCount} model call{request.modelCallCount > 1 ? 's' : ''} · {request.toolCalls.length} tool{request.toolCalls.length > 1 ? 's' : ''}{request.durationMs !== undefined && ` · ${formatDuration(request.durationMs)}`}</small></span>
            <b>{formatTurnCost(request.cost)}</b>
          </button>
        </li>)}
      </ol> : <EmptyState>Costs will appear after the first response.</EmptyState>}
    </section>
  </div>
}

function Metric({ danger = false, label, value }: { danger?: boolean; label: string; value: string }) {
  return <div className={danger ? 'danger' : undefined}><dt>{label}</dt><dd>{value}</dd></div>
}

const TOKEN_SERIES = [
  { key: 'cacheMiss', label: 'Cache miss', className: 'token-series-miss' },
  { key: 'cacheRead', label: 'Cache read', className: 'token-series-read' },
  { key: 'output', label: 'Output', className: 'token-series-output' },
] as const

type TokenSeriesKey = typeof TOKEN_SERIES[number]['key']

/** Compares token volumes for each turn with distinct, navigable series. */
function TokenUsageChart({ onNavigate, turns }: { onNavigate: (target: SessionAnalysisTarget) => void; turns: AnalyzedTurn[] }) {
  const [activePointIndex, setActivePointIndex] = useState<number>()
  const [hiddenSeries, setHiddenSeries] = useState<Set<TokenSeriesKey>>(() => new Set())
  const [chartRef, width] = useChartWidth()
  const visibleSeries = TOKEN_SERIES.filter(({ key }) => !hiddenSeries.has(key))
  const height = 178
  const padding = { top: 14, right: 16, bottom: 30, left: 12 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const maxTokens = Math.max(0, ...turns.flatMap((turn) => visibleSeries.map((series) => turn.usage[series.key])))
  const points = turns.map((turn, index) => ({
    turn,
    x: turns.length === 1 ? padding.left + plotWidth / 2 : padding.left + index * plotWidth / (turns.length - 1),
    values: visibleSeries.map((series) => {
      const value = turn.usage[series.key]
      return { ...series, value, y: padding.top + plotHeight * (1 - (maxTokens > 0 ? value / maxTokens : 0)) }
    }),
  }))
  const yTicks = (maxTokens > 0 ? [0, 0.5, 1] : [1]).map((ratio) => ({
    label: formatTokens(maxTokens * (1 - ratio)),
    y: padding.top + plotHeight * ratio,
  }))
  const activePoint = points.find(({ turn }) => turn.messageIndex === activePointIndex)
  const tooltipWidth = 148
  const toggleSeries = (key: TokenSeriesKey) => setHiddenSeries((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return <div className="token-usage-chart-block">
    <div aria-label="Displayed token series" className="token-chart-legend" role="group">
      {TOKEN_SERIES.map((series) => {
        const visible = !hiddenSeries.has(series.key)
        return <button aria-pressed={visible} className={`${series.className}${visible ? '' : ' is-hidden'}`} key={series.key} onClick={() => toggleSeries(series.key)} type="button"><i />{series.label}</button>
      })}
    </div>
    <div className="token-chart-frame">
      <div aria-hidden="true" className="chart-y-axis">
        {yTicks.map((tick) => <span key={tick.y} style={{ top: tick.y + 2 }}>{tick.label}</span>)}
      </div>
      <div className="token-chart-scroll" ref={chartRef}>
        <svg aria-label="Tokens per agent turn, in chronological order" className="token-chart" role="group" viewBox={`0 0 ${width} ${height}`}>
          {yTicks.map((tick) => <line className="chart-grid" key={tick.y} x1={padding.left} x2={width - padding.right} y1={tick.y} y2={tick.y} />)}
          {visibleSeries.map((series, seriesIndex) => <polyline className={`chart-line ${series.className}`} key={series.key} points={points.map((point) => `${point.x},${point.values[seriesIndex]?.y}`).join(' ')} />)}
          {points.map(({ turn, values, x }) => <g
            aria-label={`Tour ${turn.number}${values.length > 0 ? `, ${values.map((point) => `${point.label} ${point.value} tokens`).join(', ')}` : ''}`}
            className="chart-point"
            key={turn.messageIndex}
            onBlur={() => setActivePointIndex(undefined)}
            onClick={() => onNavigate({ kind: 'turn', index: turn.messageIndex })}
            onFocus={() => setActivePointIndex(turn.messageIndex)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onNavigate({ kind: 'turn', index: turn.messageIndex })
            }}
            onMouseEnter={() => setActivePointIndex(turn.messageIndex)}
            onMouseLeave={() => setActivePointIndex(undefined)}
            role="button"
            tabIndex={0}
          >
            <rect className="chart-column-hit" height={plotHeight} width="24" x={x - 12} y={padding.top} />
            {values.map((point) => <circle className={`chart-point-dot ${point.className}`} cx={x} cy={point.y} key={point.key} r="3.5" />)}
            <text className="chart-x-label" x={x} y={height - 9}>{turn.number}</text>
          </g>)}
          <text className="chart-axis-title" x={padding.left + plotWidth / 2} y={height - 1}>Tour</text>
          {activePoint && activePoint.values.length > 0 && <g aria-hidden="true" className="chart-tooltip token-chart-tooltip" transform={`translate(${Math.min(width - padding.right - tooltipWidth, Math.max(padding.left, activePoint.x - tooltipWidth / 2))} ${padding.top + 4})`}>
            <rect height={10 + activePoint.values.length * 14} rx="6" width={tooltipWidth} />
            <text x="10" y="14">{activePoint.values.map((point, index) => <tspan className={`token-tooltip-value ${point.className}`} dy={index === 0 ? 0 : 14} key={point.key} x="10">{point.label} · {formatTokens(point.value)}</tspan>)}</text>
          </g>}
        </svg>
      </div>
    </div>
  </div>
}

/** Plots all costs in order and keeps each turn as an accessible navigation target. */
function TurnCostChart({ onNavigate, turns }: { onNavigate: (target: SessionAnalysisTarget) => void; turns: AnalyzedTurn[] }) {
  const [activePointIndex, setActivePointIndex] = useState<number>()
  const [chartRef, width] = useChartWidth()
  const height = 178
  const padding = { top: 14, right: 16, bottom: 30, left: 12 }
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
  const activePoint = points.find(({ turn }) => turn.messageIndex === activePointIndex)
  const tooltipWidth = 124

  return <div className="turn-cost-chart-frame">
    <div aria-hidden="true" className="chart-y-axis">
      {yTicks.map((tick) => <span key={tick.y} style={{ top: tick.y + 2 }}>{tick.label}</span>)}
    </div>
    <div className="turn-cost-chart-scroll" ref={chartRef}>
      <svg aria-label="Cost of each assistant turn, in chronological order" className="turn-cost-chart" role="group" viewBox={`0 0 ${width} ${height}`}>
      {yTicks.map((tick) => <line className="chart-grid" key={tick.y} x1={padding.left} x2={width - padding.right} y1={tick.y} y2={tick.y} />)}
      {points.length > 1 && <polygon className="chart-area" points={areaPoints} />}
      {points.length > 1 && <polyline className="chart-line" points={linePoints} />}
      {points.map(({ turn, x, y }) => <g
        aria-label={`Turn ${turn.number}, ${formatTurnCost(turn.cost)}, ${turn.toolCallCount} tool${turn.toolCallCount !== 1 ? 's' : ''}`}
        className="chart-point"
        key={turn.messageIndex}
        onBlur={() => setActivePointIndex(undefined)}
        onClick={() => onNavigate({ kind: 'turn', index: turn.messageIndex })}
        onFocus={() => setActivePointIndex(turn.messageIndex)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onNavigate({ kind: 'turn', index: turn.messageIndex })
        }}
        onMouseEnter={() => setActivePointIndex(turn.messageIndex)}
        onMouseLeave={() => setActivePointIndex(undefined)}
        role="button"
        tabIndex={0}
      >
        <circle className="chart-point-hit" cx={x} cy={y} r="11" />
        <circle className="chart-point-dot" cx={x} cy={y} r="3.5" />
        <text className="chart-x-label" x={x} y={height - 9}>{turn.number}</text>
      </g>)}
        <text className="chart-axis-title" x={padding.left + plotWidth / 2} y={height - 1}>Tour</text>
        {activePoint && <g aria-hidden="true" className="chart-tooltip" transform={`translate(${Math.min(width - padding.right - tooltipWidth, Math.max(padding.left, activePoint.x - tooltipWidth / 2))} ${activePoint.y < padding.top + 48 ? activePoint.y + 13 : activePoint.y - 47})`}>
          <rect height="38" rx="6" width={tooltipWidth} />
          <text x="10" y="15"><tspan className="chart-tooltip-cost">{formatTurnCost(activePoint.turn.cost)}</tspan><tspan className="chart-tooltip-tools" x="10" dy="14">{activePoint.turn.toolCallCount} tool call{activePoint.turn.toolCallCount !== 1 ? 's' : ''}</tspan></text>
        </g>}
      </svg>
    </div>
  </div>
}

/** Tracks the actual width allocated to the chart to densify points without horizontal scrolling. */
function useChartWidth() {
  const chartRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(248)

  useLayoutEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const updateWidth = () => setWidth(Math.max(1, Math.round(chart.clientWidth)))
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(chart)
    return () => observer.disconnect()
  }, [])

  return [chartRef, width] as const
}

/** Compares cumulative volumes for a tool type without assigning monetary cost. */
function ToolUsageRow({ maxValue, metric, tool }: { maxValue: number; metric: ToolUsageRanking; tool: ToolSummary }) {
  const value = toolSummaryValue(tool, metric)
  const calls = `${tool.count} call${tool.count !== 1 ? 's' : ''}`
  const measured = metric === 'duration' && tool.measuredDurationCount < tool.count
    ? ` · ${tool.measuredDurationCount}/${tool.count} duration${tool.measuredDurationCount !== 1 ? 's' : ''} measured`
    : ''
  const failures = tool.failed > 0 ? ` · ${tool.failed} failure${tool.failed > 1 ? 's' : ''}` : ''

  return <li>
    <div><code>{tool.name}</code><b>{metric === 'duration' ? formatDuration(value) : formatCharacters(value)}</b></div>
    <span aria-hidden="true" className="tool-usage-bar"><i style={{ width: `${maxValue > 0 ? value / maxValue * 100 : 0}%` }} /></span>
    <small>{calls}{measured}{failures}</small>
  </li>
}

/** Renders a ranked call and keeps its navigation target in the conversation. */
function ToolCallRow({ call, metric, onNavigate }: { call: AnalyzedToolCall; metric: ToolRanking; onNavigate: (target: SessionAnalysisTarget) => void }) {
  return <li>
    <button onClick={() => onNavigate({ kind: 'tool', id: call.id })} type="button">
      <span><strong><code>{call.name}</code>{call.isError && <i className="error">Failed</i>}{call.pending && <i>In progress</i>}</strong><small>{formatCharacters(call.inputLength)} input · {formatCharacters(call.outputLength)} output</small></span>
      <b>{metric === 'duration' ? formatDuration(call.durationMs ?? 0) : metric === 'failure' ? 'failure' : formatCharacters(call.outputLength)}</b>
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
  return value >= 1000 ? `${new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 1 }).format(value / 1000)}k char.` : `${value} char.`
}

function formatDuration(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`
  return `${new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 1 }).format(value / 1000)} s`
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat(navigator.language, { style: 'percent', maximumFractionDigits: 1 }).format(value)
}

function formatAverage(value: number): string {
  return new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 1 }).format(value)
}
