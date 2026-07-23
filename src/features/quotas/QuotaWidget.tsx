import { useState } from 'react'
import type { QuotaProviderSnapshot, QuotaSnapshot } from '../../../shared/types.ts'

/** Présente les relevés normalisés sans déduire de quota absent des réponses fournisseurs. */
export function QuotaWidget({ quotas, onRefresh }: { quotas: QuotaSnapshot | null; onRefresh: () => Promise<void> }) {
  const [refreshing, setRefreshing] = useState(false)
  const updatedAt = Math.max(quotas?.openai.updatedAt ?? 0, quotas?.copilot.updatedAt ?? 0)

  /** Garde le bouton inactif jusqu'à la fin de la requête manuelle, succès ou erreur. */
  async function refresh(): Promise<void> {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return <>
    <header className="widget-header quota-header">
      <div>
        <strong>Quotas</strong>
        <span>{updatedAt ? `Actualisé ${formatRelativeDate(updatedAt)}` : 'Aucun relevé'}</span>
      </div>
      <button aria-label="Actualiser les quotas" className="git-refresh" disabled={refreshing || quotas?.refreshing || quotas?.sessionRequired} onClick={() => void refresh()} title="Actualiser" type="button">↻</button>
    </header>
    <div className="widget-content quota-content" aria-busy={refreshing || quotas?.refreshing}>
      {!quotas ? <QuotaSkeleton /> : <>
        {quotas.sessionRequired && <p className="quota-empty">Ouvrez une session Pi pour relever les quotas.</p>}
        <ProviderSection name="OpenAI Codex" provider={quotas.openai}>
          {quotas.openai.data.map((window) => <div className="quota-row" key={window.period}>
            <div className="quota-row-copy"><strong>{window.period === '5h' ? 'Fenêtre 5 heures' : 'Fenêtre 7 jours'}</strong><b>{formatPercent(window.remainingPercent)} restant</b></div>
            <QuotaBar label={`${formatPercent(window.remainingPercent)} restant`} value={window.remainingPercent} />
            {window.resetsAt && <small>Réinitialisation {formatReset(window.resetsAt)}</small>}
          </div>)}
        </ProviderSection>
        <ProviderSection name="GitHub Copilot" provider={quotas.copilot}>
          {quotas.copilot.data.map((window) => <div className="quota-row" key={window.name}>
            <div className="quota-row-copy"><strong>{window.name}</strong><b>{formatNumber(window.used)} / {formatNumber(window.limit)}</b></div>
            <QuotaBar label={`${formatNumber(window.used)} consommé sur ${formatNumber(window.limit)}`} value={window.used / window.limit * 100} />
            {window.resetsAt && <small>Réinitialisation {formatReset(window.resetsAt)}</small>}
          </div>)}
        </ProviderSection>
      </>}
    </div>
  </>
}

function ProviderSection({ children, name, provider }: { children: React.ReactNode; name: string; provider: QuotaProviderSnapshot<unknown> }) {
  return <section className="quota-provider" aria-label={name}>
    <div className="quota-provider-heading"><h2>{name}</h2>{provider.stale && <span>Relevé périmé</span>}</div>
    {children}
    {provider.data.length === 0 && !provider.error && <p className="quota-provider-empty">Aucun quota disponible.</p>}
    {provider.error && <p className="quota-error" role="status">{provider.error}</p>}
  </section>
}

function QuotaBar({ label, value }: { label: string; value: number }) {
  const bounded = Math.min(100, Math.max(0, value))
  return <div aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(bounded)} className="quota-bar" role="progressbar"><span style={{ width: `${bounded}%` }} /></div>
}

function QuotaSkeleton() {
  return <div aria-label="Chargement des quotas" className="quota-skeleton" role="status"><span /><span /><span /></div>
}

function formatRelativeDate(timestamp: number): string {
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  if (elapsedMinutes < 1) return 'à l’instant'
  if (elapsedMinutes < 60) return `il y a ${elapsedMinutes} min`
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp)
}

function formatReset(timestamp: number): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)} %`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)
}
