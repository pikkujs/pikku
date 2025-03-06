import { HttpRequest, HttpResponse } from 'uWebSockets.js'
import * as cookie from 'cookie'
import * as querystring from 'qs'
import { PikkuHTTPAbstractRequest } from '@pikku/core/http/pikku-http-abstract-request'

export class PikkuUWSRequest extends PikkuHTTPAbstractRequest {
  constructor(
    private request: HttpRequest,
    private response: HttpResponse
  ) {
    super(request.getUrl(), request.getMethod().toLowerCase() as any)
  }

  public async getBody() {
    try {
      // If the request method is GET, return an empty object since GET
      // shouldn't have a body
      if (this.request.getMethod() === 'get') {
        return {}
      }
      return await this.readJson()
    } catch {
      throw new Error('Failed to parse JSON')
    }
  }

  public getQuery() {
    const query = this.request.getQuery()
    return querystring.parse(query) as any
  }

  public getHeader(headerName: string) {
    return this.request.getHeader(headerName)
  }

  public getCookies(): Partial<Record<string, string>> {
    const cookieHeader = this.request.getHeader('cookie')
    return cookie.parse(cookieHeader)
  }

  private readJson() {
    return new Promise((resolve, reject) => {
      let buffer: Buffer | undefined
      /* Register data cb */
      this.response.onData((ab, isLast) => {
        let chunk = Buffer.from(ab)
        if (isLast) {
          let json
          if (buffer) {
            try {
              json = JSON.parse(Buffer.concat([buffer, chunk]).toString())
            } catch {
              /* res.close calls onAborted */
              this.response.close()
              return
            }
            resolve(json)
          } else if (chunk.length > 0) {
            try {
              json = JSON.parse(chunk.toString())
            } catch {
              /* res.close calls onAborted */
              this.response.close()
              return
            }
            resolve(json)
          } else {
            resolve({})
          }
        } else {
          if (buffer) {
            buffer = Buffer.concat([buffer, chunk])
          } else {
            buffer = Buffer.concat([chunk])
          }
        }
      })
      this.response.onAborted(reject)
    })
  }
}
