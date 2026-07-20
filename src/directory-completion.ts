export interface DirectoryCompletionTarget {
  parentPath: string
  pathPrefix: string
  namePrefix: string
}

// Isole le dossier à parcourir et le fragment de nom à compléter pour les chemins absolus et ~/….
export function directoryCompletionTarget(input: string): DirectoryCompletionTarget | null {
  const path = input.trim()
  if (!path) return { parentPath: '~', pathPrefix: '~/', namePrefix: '' }
  if (path === '~') return { parentPath: '~', pathPrefix: '~/', namePrefix: '' }
  if (!path.startsWith('/') && !path.startsWith('~/')) return null

  const separator = path.lastIndexOf('/')
  const pathPrefix = path.slice(0, separator + 1)
  const namePrefix = path.slice(separator + 1)
  const parentPath = namePrefix ? pathPrefix.slice(0, -1) || '/' : path.slice(0, -1) || '/'

  return { parentPath, pathPrefix, namePrefix }
}
