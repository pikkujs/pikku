import { compile } from 'path-to-regexp'

import type { HTTPMethod } from '@pikku/core/http'

export type Fetcher = { fetch(req: Request): Promise<Response> }

const injectIntoUrl = (route: string, keys: Record<string, string>) => {
  const path = compile(route)
  return path(keys)
}

const buildRequest = (
  route: string,
  method: HTTPMethod,
  data: Record<string, any>
): Request => {
  const url = `https://pikku.local${injectIntoUrl(route, data)}`
  const upper = (method as string).toUpperCase()
  const hasBody = upper !== 'GET' && upper !== 'HEAD'
  return new Request(url, {
    method: upper,
    headers: hasBody ? { 'content-type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(data) : undefined,
  })
}

/**
 * Worker-RPC variant of `PikkuNextJS`. Same public surface — but instead of
 * loading function code in-process, it dispatches every request through a
 * `Fetcher` (e.g. a Cloudflare service binding, a local HTTP client, or a
 * fabric-namespaced dispatcher). Function code is never bundled into the
 * SSR worker.
 */
export class PikkuNextJSWorkerRPC {
  constructor(private readonly options: { fetcher: Fetcher }) {}

  public async actionRequest<In extends Record<string, any>, Out>(
    route: unknown,
    method: unknown,
    data: In
  ): Promise<Out> {
    if (typeof route !== 'string') {
      throw new TypeError(
        `Worker RPC: route must be a string, got ${typeof route}`
      )
    }
    if (typeof method !== 'string') {
      throw new TypeError(
        `Worker RPC: method must be a string, got ${typeof method}`
      )
    }
    const req = buildRequest(route, method as HTTPMethod, data)
    const res = await this.options.fetcher.fetch(req)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(
        `Worker RPC ${method} ${route} failed: ${res.status}${body ? ` — ${body}` : ''}`
      )
    }
    let parsed: unknown
    try {
      parsed = await res.json()
    } catch {
      throw new Error(
        `Worker RPC ${method} ${route} returned non-JSON response`
      )
    }
    return parsed as Out
  }

  public async staticActionRequest<In extends Record<string, any>, Out>(
    route: unknown,
    method: unknown,
    data: In
  ): Promise<Out> {
    return this.actionRequest<In, Out>(route, method, data)
  }

  public async apiRequest(req: Request): Promise<Response> {
    return this.options.fetcher.fetch(req)
  }
}
