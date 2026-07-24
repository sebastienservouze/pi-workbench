import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import type { WorkspaceFile } from '../shared/types.ts'

const maxWorkspaceFileSize = 2 * 1024 * 1024

export class WorkspaceFileError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Reads an existing text file without allowing access outside the working directory, including through a symbolic link. */
export async function readWorkspaceFile(workspacePath: string, requestedPath: string): Promise<WorkspaceFile> {
  const root = await realpath(workspacePath)
  let path: string
  try {
    path = await realpath(resolve(root, requestedPath))
  } catch {
    throw new WorkspaceFileError('File does not exist', 404)
  }
  const pathFromRoot = relative(root, path)
  if (!pathFromRoot || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) throw new WorkspaceFileError('File must be inside the working directory', 403)

  const file = await stat(path)
  if (!file.isFile()) throw new WorkspaceFileError('Path must be a file', 400)
  if (file.size > maxWorkspaceFileSize) throw new WorkspaceFileError('File exceeds 2 MiB', 413)

  return { path, content: await readFile(path, 'utf8') }
}
