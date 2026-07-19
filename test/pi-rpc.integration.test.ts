import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { JsonLineDecoder, encodeJsonLine } from '../server/jsonl.ts'
import type { JsonObject } from '../shared/types.ts'

test('exposes current Pi commands over RPC', { timeout: 30_000 }, async () => {
  const pi = spawn('pi', ['--mode', 'rpc', '--offline', '--no-session'], {
    cwd: join(homedir(), '.pi'),
    env: { ...process.env, PI_OFFLINE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const values: JsonObject[] = []
  const waiters = new Set<() => void>()
  let stderr = ''
  const decoder = new JsonLineDecoder((value) => {
    if (isObject(value)) values.push(value)
    for (const notify of waiters) notify()
  })
  pi.stdout.on('data', (chunk: Buffer) => decoder.push(chunk))
  pi.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })

  try {
    const commandsResponse = waitFor((value) => value.type === 'response' && value.id === 'commands')
    pi.stdin.write(encodeJsonLine({ id: 'commands', type: 'get_commands' }))
    const response = await commandsResponse
    assert.equal(response.success, true)
    assert.ok(
      isObject(response.data)
        && Array.isArray(response.data.commands)
        && response.data.commands.some((command) => isObject(command) && command.name === 'agent'),
      'The current Pi installation must expose /agent',
    )

    const dialogRequest = waitFor((value) => value.type === 'extension_ui_request' && value.method === 'select')
    const promptResponse = waitFor((value) => value.type === 'response' && value.id === 'agent-selector')
    pi.stdin.write(encodeJsonLine({ id: 'agent-selector', type: 'prompt', message: '/agent' }))
    const dialog = await dialogRequest
    assert.equal(dialog.title, 'Select an agent')
    assert.ok(Array.isArray(dialog.options) && dialog.options.length > 0)
    pi.stdin.write(encodeJsonLine({ type: 'extension_ui_response', id: dialog.id, cancelled: true }))
    assert.equal((await promptResponse).success, true)
  } finally {
    pi.kill('SIGTERM')
  }

  function waitFor(predicate: (value: JsonObject) => boolean): Promise<JsonObject> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        waiters.delete(check)
        reject(new Error(`Timed out waiting for Pi RPC event. stderr: ${stderr}`))
      }, 15_000)
      function check(): void {
        const index = values.findIndex(predicate)
        if (index === -1) return
        clearTimeout(timeout)
        waiters.delete(check)
        resolve(values.splice(index, 1)[0])
      }
      waiters.add(check)
      check()
    })
  }
})

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
