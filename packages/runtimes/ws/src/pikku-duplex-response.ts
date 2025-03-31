import { Duplex } from 'stream' // Assuming `Duplex` is from Node.js' 'stream' module
import { PikkuHTTPResponse, type JSONValue } from '@pikku/core'
import { SerializeOptions } from 'cookie'

export class PikkuDuplexResponse extends PikkuHTTPResponse {
  private aborted = false

  constructor(private duplex: Duplex) {
    super()
    this.duplex.on('close', () => {
      this.aborted = true
    })
  }

  // Set the status code for the response
  public setStatus(status: number): void {
    if (!this.aborted) {
      this.duplex.write(`HTTP/1.1 ${status} OK\r\n`)
    }
  }

  // Set the response body as JSON
  public setJson(body: JSONValue): void {
    this.setHeader('Content-Type', 'application/json')
    this.setResponse(JSON.stringify(body))
  }

  public setResponse(body: string): void {
    if (!this.aborted) {
      this.writeBody(body)
    }
  }

  public setCookie(
    name: string,
    value: string,
    options: SerializeOptions
  ): void {
    throw new Error(`We don't cookies from a websocket response`)
  }

  public clearCookie(name: string): void {
    throw new Error(`We don't cookies from a websocket response`)
  }

  public setRedirect(path: string, status: number) {
    throw new Error('Method not implemented.')
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
  public setHeader(name: string, value: string): void {
    if (!this.aborted) {
      // Write the header to the response (e.g., Content-Type)
      this.duplex.write(`${name}: ${value}\r\n`)
    }
  }

  // End the response
  public end(): void {
    if (!this.aborted) {
      this.duplex.end() // Close the Duplex stream
    }
  }
}
