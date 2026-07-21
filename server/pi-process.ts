import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { JsonLineDecoder, encodeJsonLine } from './jsonl.ts'
import type { JsonObject } from '../shared/types.ts'

interface PendingRequest {
  resolve: (value: JsonObject) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export class PiProcess extends EventEmitter {
  readonly child: ChildProcessWithoutNullStreams
  readonly #pending = new Map<string, PendingRequest>()
  #stderr = ''

  /** Démarre Pi en RPC et relie son flux JSONL au cycle de vie de cette instance. */
  constructor(cwd: string, sessionId: string, sessionPath?: string) {
    super()
    const args = sessionPath ? ['--mode', 'rpc', '--session', sessionPath] : ['--mode', 'rpc', '--session-id', sessionId]

    this.child = spawn('pi', args, {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const decoder = new JsonLineDecoder((value) => this.#receive(value))
    this.child.stdout.on('data', (chunk: Buffer) => {
      try {
        decoder.push(chunk)
      } catch (error) {
        this.#fail(error)
      }
    })
    this.child.stdout.on('end', () => decoder.end())
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.#stderr = `${this.#stderr}${chunk.toString('utf8')}`.slice(-8_192)
    })
    this.child.on('error', (error) => this.#fail(error))
    this.child.on('exit', (code, signal) => {
      const detail = this.#stderr.trim()
      this.#fail(new Error(`Pi exited (${signal ?? code ?? 'unknown'})${detail ? `: ${detail}` : ''}`))
      this.emit('exit', { code, signal, detail })
    })
  }

  /** Associe une commande à une réponse RPC et rejette la promesse si Pi tarde trop. */
  request(command: JsonObject, timeoutMs = command.type === 'prompt' ? 10 * 60_000 : 30_000): Promise<JsonObject> {
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`Pi RPC command timed out: ${String(command.type)}`))
      }, timeoutMs)
      this.#pending.set(id, { resolve, reject, timeout })
      this.send({ ...command, id })
    })
  }

  send(command: JsonObject): void {
    if (!this.child.stdin.writable) throw new Error('Pi RPC input is closed')
    this.child.stdin.write(encodeJsonLine(command))
  }

  terminate(): void {
    this.child.kill('SIGTERM')
  }

  /** Distingue les réponses attendues des événements asynchrones émis par Pi. */
  #receive(value: unknown): void {
    if (!isObject(value)) return
    if (value.type === 'response' && typeof value.id === 'string') {
      const pending = this.#pending.get(value.id)
      if (pending) {
        clearTimeout(pending.timeout)
        this.#pending.delete(value.id)
        if (value.success === false) pending.reject(new Error(String(value.error ?? 'Pi RPC command failed')))
        else pending.resolve(value)
        return
      }
    }
    this.emit('event', value)
  }

  /** Réveille toutes les commandes en attente lorsqu'une erreur rend le processus inutilisable. */
  #fail(cause: unknown): void {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.#pending.clear()
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
