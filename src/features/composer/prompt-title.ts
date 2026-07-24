const maxSessionTitleLength = 90

/** Builds an immediate fallback title while leaving later extension-generated titles free to replace it. */
export function promptSessionTitle(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim()
  return normalized.length > maxSessionTitleLength
    ? `${normalized.slice(0, maxSessionTitleLength - 1)}…`
    : normalized
}
