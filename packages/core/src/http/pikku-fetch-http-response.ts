import { PikkuHTTPResponse } from './http-routes.types.js'
import {
  SerializeOptions as CookieSerializeOptions,
  serialize as serializeCookie,
} from 'cookie'

export class PikkuFetchHTTPResponse implements PikkuHTTPResponse {
  #statusCode: number = 200
  #headers = new Headers()
  #cookies = new Map<string, { value: string; flags: CookieSerializeOptions }>()

  #body: BodyInit | null = null
  #responseMode: 'stream' | null = null
  #send: ((data: string) => void) | null = null
  #close: (() => void) | null = null

  public setMode (mode: 'stream') {
    this.#responseMode = 'stream'
    if (mode === 'stream') {
      this.#body = this.createStream()
    }
  }

  public status(code: number): this {
    this.#statusCode = code
    return this
  }

  public cookie(
    name: string,
    value: string,
    flags: CookieSerializeOptions
  ): this {
    this.#cookies.set(name, { value, flags })
    return this
  }

  public header(name: string, value: string | string[]): this {
    this.#headers.delete(name)
    if (Array.isArray(value)) {
      value.forEach((v) => this.#headers.append(name, v))
    } else {
      this.#headers.set(name, value)
    }
    return this
  }

  public arrayBuffer(data: XMLHttpRequestBodyInit): this {
    if (this.#responseMode === 'stream') {
      this.#send!(data as string)
    } else {
      this.#body = data
      this.header('Content-Type', 'application/octet-stream')
    }
    return this
  }

  public json(data: unknown): this {
    if (this.#responseMode === 'stream') {
      this.#send!(JSON.stringify(data))
    } else {
      this.#body = JSON.stringify(data)
      this.header('Content-Type', 'application/json')
    }
    return this
  }

  public text(content: string): this {
    if (this.#responseMode === 'stream') {
      this.#send!(content)
    } else {
      this.#body = content
      this.header('Content-Type', 'text/plain')
    }
    return this
  }

  public html(content: string): this {
    if (this.#responseMode === 'stream') {
      this.#send!(content)
    } else {
      this.#body = content
      this.header('Content-Type', 'text/html')
    }
    return this
  }

  // public body(body: BodyInit): this {
  //   this.#body = body
  //   return this
  // }

  public redirect(location: string, status: number = 302): this {
    this.#statusCode = status
    this.header('Location', location)
    return this
  }

  public close(): this {
    if (this.#close) {
      this.#close()
    } 
    return this
  }

  public toResponse(args?: Record<string, any>): Response {
    const cookieHeader = Array.from(this.#cookies.entries()).map(
      ([name, { value, flags }]) => serializeCookie(name, value, flags)
    )
    this.#headers.set('Set-Cookie', cookieHeader.join(', '))
    return new Response(this.#body, {
      ...args,
      status: this.#statusCode,
      headers: this.#headers,
    })
  }

  private createStream(): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream({
      start: (controller) => {
        const send = (data: string) => {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };
    
        const close = () => {
          controller.close();
        };
    
        this.#send = send;
        this.#close = close;
    
        // Force initial flush
        controller.enqueue(encoder.encode(':\n\n'));
      },
    })
  }
}
