export const maxHighlightedCharacters = 10_000

export function canHighlightFile(content: string): boolean {
  return content.length <= maxHighlightedCharacters
}
