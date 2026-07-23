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

/** Résume la fenêtre principale du fournisseur actif pour le rail compact. */
export function railQuota(quotas: QuotaSnapshot | null, provider: QuotaProvider | undefined): RailQuota | undefined {
  if (!quotas || !provider) return undefined
  if (provider === 'openai') {
    const window = quotas.openai.data.find(({ period }) => period === '5h') ?? quotas.openai.data[0]
    return window && {
      label: `Quota OpenAI Codex : ${formatPercent(window.remainingPercent)} restant`,
      stale: quotas.openai.stale,
      value: `${Math.round(window.remainingPercent)}%`,
    }
  }

  const window = quotas.copilot.data[0]
  if (!window) return undefined
  const remainingPercent = (window.limit - window.used) / window.limit * 100
  return {
    label: `Quota GitHub Copilot : ${formatPercent(remainingPercent)} restant`,
    stale: quotas.copilot.stale,
    value: `${Math.round(Math.max(0, Math.min(100, remainingPercent)))}%`,
  }
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(Math.max(0, Math.min(100, value)))} %`
}
