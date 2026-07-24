export interface DirectoryCompletionTarget {
  parentPath: string
  pathPrefix: string
  namePrefix: string
}

/** Isolates the directory to scan and the name fragment to complete for absolute and ~/… paths. */
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
