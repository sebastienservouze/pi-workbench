/** Prepares an absolute file reference that the user can complete before sending. */
export function fileContextDraft(path: string): string {
  return `File to inspect: \`${path}\`\n\n`
}

/** Quotes complete Markdown output without losing its internal structure. */
export function outputContextDraft(output: string): string {
  const quote = output.split('\n').map((line) => `> ${line}`).join('\n')
  return `Previous session output:\n\n${quote}\n\n`
}
