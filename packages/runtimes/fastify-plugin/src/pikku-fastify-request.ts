import { PikkuQuery } from '@pikku/core/http'
import { PikkuHTTPAbstractRequest } from '@pikku/core/http/pikku-http-abstract-request'
import * as cookie from 'cookie'
import { FastifyRequest } from 'fastify'

export class PikkuFastifyRequest extends PikkuHTTPAbstractRequest {
  constructor(private request: FastifyRequest) {
    const url = new URL(request.url)
    super(url.pathname, request.method.toLowerCase() as any)
  }

  public async getBody() {
    return this.request.body as unknown
  }

  public getQuery() {
    return this.request.query as PikkuQuery
  }

  public getIP(): string {
    return this.request.ip
  }

  public getHeader(headerName: string) {
    return this.request.headers[headerName] as string
  }

  public getCookies(): Partial<Record<string, string>> {
    const cookieHeader = this.request.headers['cookie']
    if (cookieHeader) {
      return cookie.parse(cookieHeader)
    }
    return {}
  }
}
