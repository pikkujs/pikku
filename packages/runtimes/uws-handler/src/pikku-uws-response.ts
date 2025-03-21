import { HttpResponse } from 'uWebSockets.js'
import * as cookie from 'cookie'
import { PikkuHTTPAbstractResponse } from '@pikku/core/http/pikku-http-abstract-response'
import { JSONValue } from '@pikku/core'

export class PikkuUWSResponse extends PikkuHTTPAbstractResponse {
  private aborted = false

  constructor(private uwsResponse: HttpResponse) {
    super()
    uwsResponse.onAborted(() => {
      this.aborted = true
    })
  }

  public setStatus(status: number) {
    if (!this.aborted) {
      this.response((response) => response.writeStatus(status.toString()))
    }
  }

  public setRedirect(path: string, status: number = 307) {
    this.response((response) => {
      response.writeStatus(status.toString())
      response.writeHeader('location', path)
    })
  }

  public setJson(body: JSONValue): void {
    this.response((response) => {
      response.write(JSON.stringify(body))
    })
  }

  public setResponse(body: string | Buffer): void {
    this.response((response) => response.write(body))
  }

  public setHeader(name: string, value: string | boolean | string[]): void {
    this.response((response) => response.writeHeader(name, value.toString()))
  }

  public setCookie(name: string, value: string, options: any): void {
    this.response((response) =>
      response.writeHeader('set-cookie', cookie.serialize(name, value, options))
    )
  }

  public clearCookie(name: string): void {
    throw new Error('Method not implemented for uws.')
  }

  public end() {
    this.response((response) => response.endWithoutBody())
  }

  private response(callback: (response: HttpResponse) => void) {
    if (this.aborted) {
      throw new Error('Response was aborted')
    }
    return this.uwsResponse.cork(() => callback(this.uwsResponse))
  }
}
