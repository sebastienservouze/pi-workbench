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

/** Assemble les namespaces backend et refuse qu’une extension puisse en remplacer une autre. */
export function createBackendExtensionRegistry(extensions: readonly WorkbenchBackendExtension[]): BackendExtensionRegistry {
  const registered = new Map<string, WorkbenchBackendExtension>()
  for (const extension of extensions) {
    if (!extension.id.trim()) throw new Error('Un identifiant d’extension backend est requis')
    if (registered.has(extension.id)) throw new Error(`Extension backend dupliquée : ${extension.id}`)
    registered.set(extension.id, extension)
  }
  return { extensions: registered }
}

/** Décode une route namespacée sans laisser un chemin d’extension intercepter les routes du cœur. */
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
