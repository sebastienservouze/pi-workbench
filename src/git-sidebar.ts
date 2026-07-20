export const defaultGitSidebarWidth = 300
export const minGitSidebarWidth = 240
export const maxGitSidebarWidth = 720

export interface GitDiffLine {
  content: string
  kind: 'added' | 'context' | 'hunk' | 'removed'
  newLine: number | null
  oldLine: number | null
}

export function clampGitSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return defaultGitSidebarWidth
  return Math.min(maxGitSidebarWidth, Math.max(minGitSidebarWidth, Math.round(width)))
}

export function readGitSidebarWidth(value: string | null): number {
  return value === null ? defaultGitSidebarWidth : clampGitSidebarWidth(Number(value))
}

// Transforme un diff unifié en lignes colorables avec leurs numéros d'origine et de destination.
export function parseGitDiff(diff: string): GitDiffLine[] {
  const lines: GitDiffLine[] = []
  let inHunk = false
  let oldLine = 0
  let newLine = 0

  for (const line of diff.split('\n')) {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      inHunk = true
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      lines.push({ content: line, kind: 'hunk', newLine: null, oldLine: null })
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('-')) {
      lines.push({ content: line.slice(1), kind: 'removed', newLine: null, oldLine })
      oldLine += 1
    } else if (line.startsWith('+')) {
      lines.push({ content: line.slice(1), kind: 'added', newLine, oldLine: null })
      newLine += 1
    } else if (line.startsWith(' ')) {
      lines.push({ content: line.slice(1), kind: 'context', newLine, oldLine })
      oldLine += 1
      newLine += 1
    }
  }

  return lines
}
