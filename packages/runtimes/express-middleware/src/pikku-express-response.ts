import { JSONValue } from '@pikku/core'
import { PikkuHTTPAbstractResponse } from '@pikku/core/http/pikku-http-abstract-response'
import { Response, CookieOptions } from 'express-serve-static-core'

export class PikkuExpressResponse extends PikkuHTTPAbstractResponse {
  constructor(protected response: Response) {
    super()
  }

  public setStatus(status: number) {
    this.response.status(status)
  }

  public setRedirect(path: string, status: number = 307) {
    this.response.redirect(status, path)
  }

  public setJson(body: JSONValue): void {
    this.response.json(body)
  }

  public setResponse(body: string | Buffer): void {
    this.response.send(body)
  }

  public setCookie(name: string, value: string, options: CookieOptions): void {
    this.response.cookie(name, value, options)
  }

  public clearCookie(name: string): void {
    this.response.clearCookie(name)
  }

  public end(): void {
    this.response.end()
  }
}
