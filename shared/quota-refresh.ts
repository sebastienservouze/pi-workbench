const automaticRefreshIntervalMs = 30_000

export function quotaRefreshAllowed(lastRefreshAt: number, automatic: boolean, now: number): boolean {
  return !automatic || now - lastRefreshAt >= automaticRefreshIntervalMs
}
