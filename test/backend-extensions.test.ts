import assert from 'node:assert/strict'
import test from 'node:test'
import { BackendExtensionHttpError, createBackendExtensionRegistry, matchBackendExtensionRoute, type BackendExtensionRequestHandler } from '../server/extensions/backend.ts'
import { requestExtension } from '../src/api.ts'

const handler: BackendExtensionRequestHandler = () => ({ ok: true })

test('registers one backend namespace per extension', () => {
  const extension = { apiVersion: 1 as const, id: 'workspace-tools', handleRequest: handler }
  const registry = createBackendExtensionRegistry([extension])

  assert.equal(registry.extensions.get('workspace-tools'), extension)
  assert.equal(matchBackendExtensionRoute(registry, '/api/extensions/workspace-tools/files/current')?.extension, extension)
  assert.equal(matchBackendExtensionRoute(registry, '/api/extensions/workspace-tools/files/current')?.path, 'files/current')
  assert.equal(matchBackendExtensionRoute(registry, '/api/git'), undefined)
  assert.equal(matchBackendExtensionRoute(registry, '/api/extensions/missing')?.extension, undefined)
  assert.throws(() => matchBackendExtensionRoute(registry, '/api/extensions/%E0%A4%A'), /Invalid extension route encoding/)
  assert.throws(() => createBackendExtensionRegistry([extension, extension]), /Extension backend dupliquée : workspace-tools/)
  assert.throws(() => createBackendExtensionRegistry([{ ...extension, id: '' }]), /identifiant d’extension backend est requis/)
})

test('binds frontend requests to their encoded extension namespace', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = async (input) => {
    requestedUrl = String(input)
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  try {
    assert.deepEqual(await requestExtension('my extension', '/status/current?verbose=true'), { ok: true })
    assert.equal(requestedUrl, '/api/extensions/my%20extension/status/current?verbose=true')
    await assert.rejects(() => requestExtension('my extension', '../other'), /cannot traverse namespaces/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('restricts extension HTTP errors to client and server statuses', () => {
  assert.equal(new BackendExtensionHttpError(409, 'Conflict').status, 409)
  assert.throws(() => new BackendExtensionHttpError(200, 'Invalid'), /between 400 and 599/)
})
