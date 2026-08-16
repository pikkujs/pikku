import { STATUS_CODES } from 'http'
import type { Duplex } from 'stream' // Assuming `Duplex` is from Node.js' 'stream' module
import type { JSONValue } from '@pikku/core/types'
import type { PikkuHTTPResponse } from '@pikku/core/http'
import type { SerializeOptions } from 'cookie'

/**
 * The response half of a websocket upgrade, writing onto the raw socket.
 *
 * Everything is buffered because a successful upgrade's first bytes must be
 * `ws`'s `101` status line, while the middleware chain sets headers (CORS) on
 * every request. Written eagerly they corrupt the handshake; buffered, they are
 * discarded when the upgrade proceeds and flushed behind a status line only
 * when it is rejected.
 */
export class PikkuDuplexResponse implements PikkuHTTPResponse {
  private aborted = false
  private flushed = false
  #statusCode: number = 200
  #headers: string[] = []

  constructor(private duplex: Duplex) {
    this.duplex.on('close', () => {
      this.aborted = true
    })
  }

  public get statusCode(): number {
    return this.#statusCode
  }

  public redirect(location: string, status?: number): this {
    throw new Error('Method not implemented.')
  }

  public status(status: number): this {
    this.#statusCode = status
    return this
  }

  public json(body: JSONValue): this {
    this.header('Content-Type', 'application/json')
    this.writeBody(JSON.stringify(body))
    return this
  }

  public arrayBuffer(body: string): this {
    this.writeBody(body)
    return this
  }

  public cookie(name: string, value: string, options: SerializeOptions): this {
    throw new Error(`We don't cookies from a websocket response`)
  }

  public header(name: string, value: string): this {
    const sanitized = (s: string) => s.replace(/[\r\n]/g, '')
    this.#headers.push(`${sanitized(name)}: ${sanitized(value)}\r\n`)
    return this
  }

  public end(): void {
    if (this.aborted) {
      return
    }
    this.flushHead()
    this.duplex.end()
  }

  /** Writes the status line and every buffered header, once. */
  private flushHead(): void {
    if (this.flushed || this.aborted) {
      return
    }
    this.flushed = true
    const reason = STATUS_CODES[this.#statusCode] ?? 'Unknown'
    this.duplex.write(`HTTP/1.1 ${this.#statusCode} ${reason}\r\n`)
    for (const header of this.#headers) {
      this.duplex.write(header)
    }
    // Empty line to separate headers from body
    this.duplex.write('\r\n')
  }

  private writeBody(body: string | Buffer): void {
    if (this.aborted) {
      return
    }
    this.flushHead()
    this.duplex.write(body)
  }
}
