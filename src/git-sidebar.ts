export const defaultGitSidebarWidth = 300
export const minGitSidebarWidth = 240
export const maxGitSidebarWidth = 480

export function clampGitSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return defaultGitSidebarWidth
  return Math.min(maxGitSidebarWidth, Math.max(minGitSidebarWidth, Math.round(width)))
}

export function readGitSidebarWidth(value: string | null): number {
  return value === null ? defaultGitSidebarWidth : clampGitSidebarWidth(Number(value))
}
