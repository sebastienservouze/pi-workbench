import type { IncomingMessage, ServerResponse } from 'node:http'
import type { JsonObject } from '../../shared/types.ts'

export interface BackendExtensionRequest {
  method: string
  path: string
  request: IncomingMessage
  response: ServerResponse
  url: URL
  readJsonBody: () => Promise<JsonObject>
  resolveWorkingDirectory: (input: string) => Promise<string>
}

export type BackendExtensionRequestHandler = (context: BackendExtensionRequest) => unknown | Promise<unknown>

export interface WorkbenchBackendExtension {
  id: string
  handleRequest: BackendExtensionRequestHandler
}

export interface BackendExtensionRegistry {
  extensions: ReadonlyMap<string, WorkbenchBackendExtension>
}

export interface BackendExtensionRouteMatch {
  extension?: WorkbenchBackendExtension
  extensionId: string
  path: string
}

/** Builds backend namespaces and prevents one extension from replacing another. */
export function createBackendExtensionRegistry(extensions: readonly WorkbenchBackendExtension[]): BackendExtensionRegistry {
  const registered = new Map<string, WorkbenchBackendExtension>()
  for (const extension of extensions) {
    if (!extension.id.trim()) throw new Error('A backend extension identifier is required')
    if (registered.has(extension.id)) throw new Error(`Duplicate backend extension: ${extension.id}`)
    registered.set(extension.id, extension)
  }
  return { extensions: registered }
}

/** Decodes a namespaced route without allowing an extension path to intercept core routes. */
export function matchBackendExtensionRoute(registry: BackendExtensionRegistry, pathname: string): BackendExtensionRouteMatch | undefined {
  const match = pathname.match(/^\/api\/extensions\/([^/]+)(?:\/(.*))?$/)
  if (!match) return undefined
  try {
    const extensionId = decodeURIComponent(match[1])
    const path = (match[2] ?? '').split('/').map(decodeURIComponent).join('/')
    return { extension: registry.extensions.get(extensionId), extensionId, path }
  } catch {
    throw new BackendExtensionHttpError(400, 'Invalid extension route encoding')
  }
}

export class BackendExtensionHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    if (!Number.isInteger(status) || status < 400 || status > 599) throw new Error('An extension HTTP error status must be between 400 and 599')
    this.status = status
  }
}
