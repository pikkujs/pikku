import { IncomingMessage } from 'http'
import * as cookie from 'cookie'
import { PikkuHTTPAbstractRequest } from '@pikku/core/http/pikku-http-abstract-request'
import { HTTPMethod, PikkuQuery } from '@pikku/core/http'

export class PikkuHTTPRequest extends PikkuHTTPAbstractRequest {
  private query: PikkuQuery | undefined
  private url: URL

  constructor(private request: IncomingMessage) {
    // TODO: This is a hack to make the URL object work without caring about the domain
    const url = new URL(request.url || '/', 'http://ignore-this.com')
    const method = request.method?.toLowerCase() as HTTPMethod
    super(url.pathname, method)
    this.url = url
  }

  public async getBody() {
    try {
      // If the request method is GET, return an empty object since GET
      // shouldn't have a body
      if (this.method === 'get') {
        return {}
      }
      return await this.readJson()
    } catch {
      throw new Error('Failed to parse JSON')
    }
  }

  public getQuery() {
    if (!this.query) {
      this.query = Object.fromEntries(this.url.searchParams.entries())
    }
    return this.query
  }

  public getHeader(headerName: string) {
    return this.request.headers[headerName.toLowerCase()] as string | undefined
  }

  public getCookies(): Partial<Record<string, string>> {
    const cookieHeader = this.request.headers['cookie']
    return cookie.parse(cookieHeader || '')
  }

  private readJson() {
    return new Promise((resolve, reject) => {
      let body: Buffer[] = []

      // Read data from the request stream
      this.request.on('data', (chunk) => {
        body.push(chunk)
      })

      // When the request is complete
      this.request.on('end', () => {
        try {
          const buffer = Buffer.concat(body)
          const json = JSON.parse(buffer.toString())
          resolve(json)
        } catch (err) {
          reject(new Error('Failed to parse JSON'))
        }
      })

      // If the connection is closed or aborted
      this.request.on('error', (err) => {
        reject(err)
      })
    })
  }
}
