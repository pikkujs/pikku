import type { PikkuHTTPResponse } from '@pikku/core/http'
import type { SerializeOptions } from 'cookie'
import { cookies } from 'next/headers.js'

export class PikkuActionNextResponse implements PikkuHTTPResponse {
  private cookieStore: any

  constructor(private dynamic: boolean) {}

  public async init() {
    if (this.dynamic) {
      this.cookieStore = await cookies()
    }
  }

  status(code: number): this {
    // This doesn't matter since SSR expects data
    return this
  }

  cookie(name: string, value: string, options: SerializeOptions): this {
    this.getCookieStore().set(name, value, options)
    return this
  }

  header(name: string, value: string | string[]): this {
    // This doesn't matter since SSR expects data
    return this
  }

  arrayBuffer(data: XMLHttpRequestBodyInit): this {
    throw new Error("Next Resposne doesn't support arrayBuffer")
  }

  json(data: unknown): this {
    return this
  }

  redirect(location: string, status?: number): this {
    return this
  }

  private getCookieStore() {
    if (!this.cookieStore) {
      if (!this.dynamic) {
        throw new Error('Need to allow dynamic optin for cookies')
      }
      if (!this.cookieStore) {
        throw new Error('init() needs to be called')
      }
    }
    return this.cookieStore
  }
}
