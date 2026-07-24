import type { CopilotQuotaWindow, JsonObject, OpenAiQuotaWindow, QuotaProviderReport, QuotaProviderSnapshot, QuotaReport, QuotaSnapshot } from '../../../shared/types.ts'

const emptyProvider = <T>(): QuotaProviderSnapshot<T> => ({ data: [], stale: false })

/** Keeps each provider's last valid snapshot when the next one fails. */
export class QuotaCache {
  #openai = emptyProvider<OpenAiQuotaWindow>()
  #copilot = emptyProvider<CopilotQuotaWindow>()
  #refreshing = false

  snapshot(sessionRequired: boolean): QuotaSnapshot {
    return { openai: this.#openai, copilot: this.#copilot, refreshing: this.#refreshing, sessionRequired }
  }

  setRefreshing(refreshing: boolean): void {
    this.#refreshing = refreshing
  }

  /** Accepts only the private, versioned status emitted by the quota extension. */
  receiveManagerEvent(event: unknown): boolean {
    const data = object(object(event)?.data)
    if (object(event)?.event !== 'pi' || data?.type !== 'extension_ui_request' || data.method !== 'setStatus' || data.statusKey !== 'pi-workbench.quotas' || typeof data.statusText !== 'string') return false
    let parsed: unknown
    try {
      parsed = JSON.parse(data.statusText)
    } catch {
      return false
    }
    const report = parseQuotaReport(parsed)
    if (!report) return false
    this.#openai = mergeProvider(this.#openai, report.openai, report.refreshedAt)
    this.#copilot = mergeProvider(this.#copilot, report.copilot, report.refreshedAt)
    this.#refreshing = false
    return true
  }
}

function mergeProvider<T>(current: QuotaProviderSnapshot<T>, report: QuotaProviderReport<T>, updatedAt: number): QuotaProviderSnapshot<T> {
  if (report.ok) return { data: report.data, updatedAt, stale: false }
  return { ...current, stale: current.updatedAt !== undefined, error: report.error }
}

function parseQuotaReport(value: unknown): QuotaReport | undefined {
  const report = object(value)
  if (report?.protocol !== 'pi-workbench.quotas' || report.version !== 1 || !finiteNumber(report.refreshedAt)) return undefined
  const openai = parseProvider(report.openai, parseOpenAiWindow)
  const copilot = parseProvider(report.copilot, parseCopilotWindow)
  if (!openai || !copilot) return undefined
  return { protocol: 'pi-workbench.quotas', version: 1, refreshedAt: report.refreshedAt, openai, copilot }
}

function parseProvider<T>(value: unknown, parseItem: (value: unknown) => T | undefined): QuotaProviderReport<T> | undefined {
  const provider = object(value)
  if (provider?.ok === false && typeof provider.error === 'string') return { ok: false, error: provider.error.slice(0, 300) }
  if (provider?.ok !== true || !Array.isArray(provider.data)) return undefined
  const data = provider.data.map(parseItem)
  return data.every((item): item is T => item !== undefined) ? { ok: true, data } : undefined
}

function parseOpenAiWindow(value: unknown): OpenAiQuotaWindow | undefined {
  const window = object(value)
  if ((window?.period !== '5h' && window?.period !== '7d') || !finiteNumber(window.remainingPercent)) return undefined
  const resetsAt = finiteNumber(window.resetsAt) ? window.resetsAt : undefined
  return { period: window.period, remainingPercent: Math.min(100, Math.max(0, window.remainingPercent)), ...(resetsAt ? { resetsAt } : {}) }
}

function parseCopilotWindow(value: unknown): CopilotQuotaWindow | undefined {
  const window = object(value)
  if (typeof window?.name !== 'string' || !finiteNumber(window.used) || !finiteNumber(window.limit) || window.limit <= 0) return undefined
  const resetsAt = finiteNumber(window.resetsAt) ? window.resetsAt : undefined
  return { name: window.name.slice(0, 80), used: Math.max(0, window.used), limit: window.limit, ...(resetsAt ? { resetsAt } : {}) }
}

function object(value: unknown): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
