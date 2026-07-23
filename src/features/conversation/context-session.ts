/** Prépare une référence de fichier absolue que l’utilisateur peut compléter avant envoi. */
export function fileContextDraft(path: string): string {
  return `Fichier à examiner : \`${path}\`\n\n`
}

/** Cite une sortie Markdown complète sans perdre sa structure interne. */
export function outputContextDraft(output: string): string {
  const quote = output.split('\n').map((line) => `> ${line}`).join('\n')
  return `Sortie de la session précédente :\n\n${quote}\n\n`
}
