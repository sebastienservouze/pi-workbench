import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { connect, type Socket } from 'node:net'
import { JsonLineDecoder, encodeJsonLine } from './jsonl.ts'
import type { ManagerMessage, ManagerRequest } from '../shared/types.ts'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export class ManagerClient extends EventEmitter {
  readonly #host: string
  readonly #port: number
  readonly #pending = new Map<string, PendingRequest>()
  #socket: Socket | null = null
  #reconnectTimer: NodeJS.Timeout | null = null
  connected = false

  constructor(host: string, port: number) {
    super()
    this.#host = host
    this.#port = port
  }

  start(): void {
    this.#connect()
  }

  request(request: Omit<ManagerRequest, 'id'>, timeoutMs = 35_000): Promise<unknown> {
    if (!this.#socket?.writable || !this.connected) return Promise.reject(new Error('Pi manager is unavailable'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`Manager request timed out: ${request.action}`))
      }, timeoutMs)
      this.#pending.set(id, { resolve, reject, timeout })
      this.#socket?.write(encodeJsonLine({ ...request, id }))
    })
  }

  #connect(): void {
    if (this.#socket) return
    const socket = connect({ host: this.#host, port: this.#port })
    this.#socket = socket
    const decoder = new JsonLineDecoder((value) => this.#receive(value))

    socket.setNoDelay(true)
    socket.on('connect', () => {
      this.connected = true
      this.emit('connected')
    })
    socket.on('data', (chunk) => {
      try {
        decoder.push(chunk)
      } catch (error) {
        socket.destroy(error instanceof Error ? error : new Error(String(error)))
      }
    })
    socket.on('end', () => decoder.end())
    socket.on('error', () => undefined)
    socket.on('close', () => {
      this.connected = false
      this.#socket = null
      this.#rejectPending(new Error('Connection to Pi manager closed'))
      this.emit('disconnected')
      this.#scheduleReconnect()
    })
  }

  #scheduleReconnect(): void {
    if (this.#reconnectTimer) return
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      this.#connect()
    }, 500)
  }

  #receive(value: unknown): void {
    if (!isManagerMessage(value)) return
    if (value.kind === 'event') {
      this.emit('event', value)
      return
    }
    const pending = this.#pending.get(value.id)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.#pending.delete(value.id)
    if (value.ok) pending.resolve(value.data)
    else pending.reject(new Error(value.error ?? 'Manager request failed'))
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.#pending.clear()
  }
}

function isManagerMessage(value: unknown): value is ManagerMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as { kind?: unknown }
  return message.kind === 'response' || message.kind === 'event'
}
