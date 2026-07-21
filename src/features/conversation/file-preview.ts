export const maxHighlightedCharacters = 50_000

export function canHighlightFile(content: string): boolean {
  return content.length <= maxHighlightedCharacters
}
