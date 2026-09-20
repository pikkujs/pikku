import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { serveStdio } from '@modelcontextprotocol/server/stdio'

import type { MCPAuthOptions } from './mcp-auth.js'
import { PikkuMCPFetchServer } from './pikku-mcp-fetch-server.js'

export type { MCPServerConfig } from './pikku-mcp-fetch-server.js'

export interface MCPHttpOptions {
  port?: number
  host?: string
  path?: string
}

/**
 * A node `IncomingMessage` as the web-standard `Request` the MCP transport and
 * the pikku runner both speak.
 *
 * The body is streamed rather than buffered so a large `tools/call` payload does
 * not have to be held whole before the transport sees any of it. GET and DELETE
 * carry no body, and giving `Request` one for those methods is an error.
 */
const nodeRequestAsWebRequest = (req: IncomingMessage): Request => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry)
    } else if (value !== undefined) {
      headers.set(name, value)
    }
  }
  const method = req.method ?? 'POST'
  const host = req.headers.host ?? 'localhost'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(new URL(req.url ?? '/', `http://${host}`), {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // Required by undici whenever a body is present on a streamed request.
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit)
}

/**
 * Write a web-standard `Response` back out over a node `ServerResponse`.
 *
 * The body is piped rather than awaited so an SSE stream reaches the client as
 * it is produced — buffering it would hold the whole MCP response until the
 * stream closed, which for a streaming transport is never.
 */
const writeWebResponse = async (
  res: ServerResponse,
  response: Response
): Promise<void> => {
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (!response.body) {
    res.end()
    return
  }
  await pipeline(Readable.fromWeb(response.body as any), res)
}

/**
 * The node MCP server: the web-standard core plus the entry points that only
 * node has — a `node:http` listener and stdio.
 *
 * A runtime without those (workers, deno) imports
 * `@pikku/modelcontextprotocol/fetch` instead, because the `node:` imports
 * above are resolved eagerly and would fail the bundle there.
 */
export class PikkuMCPServer extends PikkuMCPFetchServer {
  private stdioHandle?: { close: () => Promise<void> }

  public override async stop(): Promise<void> {
    if (this.stdioHandle) {
      await this.stdioHandle.close()
    }
    await super.stop()
  }

  public async connectStdio(): Promise<void> {
    if (this.connected) {
      throw new Error('MCP server is already connected')
    }
    // `serveStdio` owns the transport and the era decision: it pins one
    // instance from the factory for the connection's lifetime, so a 2025-era
    // client and a 2026-era one are both served from the same registration.
    this.stdioHandle = serveStdio(this.serverFactory, {
      onerror: (error) => this.logger.error('mcp stdio error', error),
    })
    this.connected = true
  }

  /**
   * The node HTTP entry point, as an adapter over {@link createFetchHandler}.
   *
   * The MCP SDK's own node transport is a wrapper around its web-standard one,
   * so a second dispatch path here would only be a second place for the two
   * runtimes to disagree — which is how node MCP calls ended up running without
   * the caller's request while fetch ones carried it. Node is stateless for the
   * same reason fetch is: each request brings its own credentials rather than
   * inheriting them from whoever opened a session id.
   */
  public createHTTPRequestHandler(options?: {
    path?: string
    auth?: MCPAuthOptions
  }): {
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
    /** Which paths this handler answers, so a host routes the discovery document here too. */
    ownsPath: (pathname: string) => boolean
  } {
    const { handler: fetchHandler, ownsPath } = this.createFetchHandler(options)
    const processLogger = this.logger

    const handler = async (req: IncomingMessage, res: ServerResponse) => {
      try {
        await writeWebResponse(
          res,
          await fetchHandler(nodeRequestAsWebRequest(req))
        )
      } catch (err) {
        processLogger?.error('mcp handler error', err)
        if (!res.headersSent) {
          res.writeHead(500).end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Internal server error' },
              id: null,
            })
          )
        }
      }
    }

    return { handler, ownsPath }
  }

  public async connectHTTP(options?: MCPHttpOptions): Promise<{
    httpServer: HttpServer
    close: () => Promise<void>
  }> {
    const { handler } = this.createHTTPRequestHandler({
      path: options?.path,
    })
    const port = options?.port ?? 3000
    const host = options?.host ?? '127.0.0.1'

    const httpServer = createServer(handler)

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        httpServer.removeListener('error', onError)
        reject(err)
      }
      httpServer.on('error', onError)
      httpServer.listen(port, host, () => {
        httpServer.removeListener('error', onError)
        this.logger.info(
          `MCP HTTP server listening on http://${host}:${port}${options?.path ?? '/mcp'}`
        )
        resolve()
      })
    })

    return {
      httpServer,
      close: async () => {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((err) => (err ? reject(err) : resolve()))
        })
        await this.stop()
      },
    }
  }
}
