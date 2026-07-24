export const defaultRightSidebarWidth = 300
export const minRightSidebarWidth = 240
export const maxRightSidebarWidth = 720

export function clampRightSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return defaultRightSidebarWidth
  return Math.min(maxRightSidebarWidth, Math.max(minRightSidebarWidth, Math.round(width)))
}

export function readRightSidebarWidth(value: string | null): number {
  return value === null ? defaultRightSidebarWidth : clampRightSidebarWidth(Number(value))
}
