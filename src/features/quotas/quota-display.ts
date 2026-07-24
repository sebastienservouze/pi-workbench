import type { QuotaSnapshot } from '../../../shared/types.ts'

export type QuotaProvider = 'openai' | 'copilot'

export interface RailQuota {
  label: string
  stale: boolean
  value: string
}

export function quotaProviderForModel(provider: unknown): QuotaProvider | undefined {
  if (provider === 'openai-codex') return 'openai'
  if (provider === 'github-copilot') return 'copilot'
  return undefined
}

/** Summarizes the main window of the active provider for the compact rail. */
export function railQuota(quotas: QuotaSnapshot | null, provider: QuotaProvider | undefined): RailQuota | undefined {
  if (!quotas || !provider) return undefined
  if (provider === 'openai') {
    const window = quotas.openai.data.find(({ period }) => period === '5h') ?? quotas.openai.data[0]
    return window && {
      label: `OpenAI Codex quota: ${formatPercent(window.remainingPercent)} remaining`,
      stale: quotas.openai.stale,
      value: `${Math.round(window.remainingPercent)}%`,
    }
  }

  const window = quotas.copilot.data[0]
  if (!window) return undefined
  const remainingPercent = (window.limit - window.used) / window.limit * 100
  return {
    label: `GitHub Copilot quota: ${formatPercent(remainingPercent)} remaining`,
    stale: quotas.copilot.stale,
    value: `${Math.round(Math.max(0, Math.min(100, remainingPercent)))}%`,
  }
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat(navigator.language, { maximumFractionDigits: 1 }).format(Math.max(0, Math.min(100, value)))} %`
}
