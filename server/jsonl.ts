import { StringDecoder } from 'node:string_decoder'

const MAX_BUFFER_SIZE = 4 * 1024 * 1024

/**
 * Decodes a strict JSONL stream without treating Unicode separators as line
 * endings, according to Pi's RPC protocol.
 */
export class JsonLineDecoder {
  readonly #decoder = new StringDecoder('utf8')
  readonly #onValue: (value: unknown) => void
  #buffer = ''

  constructor(onValue: (value: unknown) => void) {
    this.#onValue = onValue
  }

  push(chunk: Buffer | string): void {
    this.#buffer += typeof chunk === 'string' ? chunk : this.#decoder.write(chunk)
    this.#drain(false)
  }

  end(): void {
    this.#buffer += this.#decoder.end()
    this.#drain(true)
  }

  #drain(flush: boolean): void {
    let newlineIndex = this.#buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      this.#parse(this.#buffer.slice(0, newlineIndex))
      this.#buffer = this.#buffer.slice(newlineIndex + 1)
      newlineIndex = this.#buffer.indexOf('\n')
    }

    if (this.#buffer.length > MAX_BUFFER_SIZE) {
      throw new Error('JSONL record exceeds 4 MiB')
    }

    if (flush && this.#buffer.length > 0) {
      this.#parse(this.#buffer)
      this.#buffer = ''
    }
  }

  #parse(line: string): void {
    const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line
    if (normalizedLine.length > 0) this.#onValue(JSON.parse(normalizedLine))
  }
}

export function encodeJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`
}
