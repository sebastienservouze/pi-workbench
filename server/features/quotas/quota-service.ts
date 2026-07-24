import type { ManagerEvent, QuotaSnapshot } from '../../../shared/types.ts'
import type { ManagerClient } from '../../manager-client.ts'
import { QuotaCache } from './quota-cache.ts'

/** Coordinates quota snapshots and refresh commands without exposing Pi details to HTTP routing. */
export class QuotaService {
  readonly #cache = new QuotaCache()
  readonly #manager: ManagerClient
  #refresh: Promise<QuotaSnapshot> | undefined

  constructor(manager: ManagerClient) {
    this.#manager = manager
  }

  receiveManagerEvent(event: ManagerEvent): void {
    this.#cache.receiveManagerEvent(event)
  }

  /** Reports cached quotas and whether a Pi session is required to refresh them. */
  async snapshot(): Promise<QuotaSnapshot> {
    const sessions = await this.#manager.request({ action: 'list' })
    return this.#cache.snapshot(!Array.isArray(sessions) || sessions.length === 0)
  }

  /** Deduplicates concurrent requests and lets the extension apply its automatic delay. */
  refresh(sessionId: string, automatic = false): Promise<QuotaSnapshot> {
    this.#refresh ??= (async () => {
      this.#cache.setRefreshing(true)
      try {
        await this.#manager.request({ action: 'command', sessionId, command: { type: 'prompt', message: `/workbench-quotas${automatic ? ' auto' : ''}` } }, 60_000)
      } finally {
        this.#cache.setRefreshing(false)
      }
      return this.#cache.snapshot(false)
    })().finally(() => { this.#refresh = undefined })
    return this.#refresh
  }

  /** Restores the cache after a backend restart without interrupting an active session. */
  async restoreFromIdleSession(): Promise<void> {
    try {
      const sessions = await this.#manager.request({ action: 'list' })
      if (!Array.isArray(sessions)) return
      const idleSession = sessions.find((session) => isObject(session) && session.status === 'idle' && typeof session.id === 'string')
      if (isObject(idleSession) && typeof idleSession.id === 'string') await this.refresh(idleSession.id, true)
    } catch {
      // A manual refresh remains possible once the manager is available.
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
