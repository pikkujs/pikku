import type { Duplex } from 'stream' // Assuming `Duplex` is from Node.js' 'stream' module
import type { JSONValue } from '@pikku/core'
import type { PikkuHTTPResponse } from '@pikku/core/http'
import type { SerializeOptions } from 'cookie'

export class PikkuDuplexResponse implements PikkuHTTPResponse {
  private aborted = false

  constructor(private duplex: Duplex) {
    this.duplex.on('close', () => {
      this.aborted = true
    })
  }

  public redirect(location: string, status?: number): this {
    throw new Error('Method not implemented.')
  }

  // Set the status code for the response
  public status(status: number): this {
    if (!this.aborted) {
      this.duplex.write(`HTTP/1.1 ${status} OK\r\n`)
    }
    return this
  }

  public json(body: JSONValue): this {
    this.header('Content-Type', 'application/json')
    this.writeBody(JSON.stringify(body))
    return this
  }

  public arrayBuffer(body: string): this {
    if (!this.aborted) {
      this.writeBody(body)
    }
    return this
  }

  public cookie(name: string, value: string, options: SerializeOptions): this {
    throw new Error(`We don't cookies from a websocket response`)
  }

  // Helper function to write the body
  private writeBody(body: string | Buffer): void {
    if (!this.aborted) {
      // Write the headers
      this.duplex.write('\r\n') // Empty line to separate headers from body
      // Write the actual body content
      this.duplex.write(body)
    }
  }

  // Set headers (for content-type, cookies, etc.)
  public header(name: string, value: string): this {
    if (!this.aborted) {
      // Write the header to the response (e.g., Content-Type)
      this.duplex.write(`${name}: ${value}\r\n`)
    }
    return this
  }

  // End the response
  public end(): void {
    if (!this.aborted) {
      this.duplex.end() // Close the Duplex stream
    }
  }
}
