import type { CoreSingletonServices } from '@pikku/core/types'
import { PikkuMCPServer } from '@pikku/modelcontextprotocol'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { rpcService } from '@pikku/core/rpc'

import {
  type CloudflareEnv,
  type ServiceFactories,
  setupServices,
} from './handler-factories.js'
import { runFetch } from './run-fetch.js'

/**
 * The parsed contents of the unit's `.pikku/mcp/mcp*.gen.json`, which is what
 * `PikkuMCPServer` reads its tool, resource and prompt list from.
 */
export interface CloudflareMCPSurface {
  tools?: unknown[]
  resources?: unknown[]
  prompts?: unknown[]
}

export interface CloudflareMCPOptions {
  mcpJson: CloudflareMCPSurface
  /** Where the endpoint is mounted. Default `/mcp`, matching every other runtime. */
  mcpPath?: string
}

const surfaceIsEmpty = (surface: CloudflareMCPSurface): boolean =>
  (surface.tools?.length ?? 0) +
    (surface.resources?.length ?? 0) +
    (surface.prompts?.length ?? 0) ===
  0

/**
 * Creates a WorkerEntrypoint that serves MCP over Streamable HTTP alongside the
 * unit's ordinary HTTP routes.
 *
 * This exists as its own module, reached through `@pikku/cloudflare/mcp`, so
 * that the MCP SDK is only pulled into the bundle of a unit that actually
 * serves MCP. A worker that does not is unaffected by it.
 *
 * The server is built once per isolate and reused: `PikkuMCPServer` is
 * stateless per request (`createFetchHandler` builds a fresh protocol server
 * for each one), so the only thing worth caching is the surface it was
 * constructed from.
 */
export function createCloudflareMCPHandler(
  factories: ServiceFactories,
  options: CloudflareMCPOptions
) {
  const mcpPath = options.mcpPath ?? '/mcp'
  const { mcpJson } = options

  let mounted:
    | Promise<{
        handler: (request: Request) => Promise<Response>
        ownsPath: (pathname: string) => boolean
      } | null>
    | undefined

  const mount = async (services: CoreSingletonServices) => {
    if (surfaceIsEmpty(mcpJson)) {
      services.logger.warn(
        `pikku-cloudflare: MCP surface is empty — nothing mounted at ${mcpPath}`
      )
      return null
    }
    const { tools = [], resources = [], prompts = [] } = mcpJson
    const mcpServer = new PikkuMCPServer(
      {
        name: 'pikku',
        version: '1.0.0',
        mcpJSON: mcpJson,
        capabilities: {
          ...(tools.length > 0 && { tools: {} }),
          ...(resources.length > 0 && { resources: {} }),
          ...(prompts.length > 0 && { prompts: {} }),
        },
      },
      services.logger
    )
    await mcpServer.init()
    services.logger.info(`pikku-cloudflare: MCP mounted at ${mcpPath}`)
    return mcpServer.createFetchHandler({ path: mcpPath })
  }

  return class PikkuMCPWorker extends WorkerEntrypoint<CloudflareEnv> {
    async fetch(request: Request): Promise<Response> {
      const services = await setupServices(this.env, factories)
      // A failed mount must not take the unit's HTTP routes down with it, and
      // retrying it on the next request would just repeat the same failure, so
      // the rejected promise is replaced with a resolved "nothing is mounted".
      mounted ??= mount(services).catch((e) => {
        services.logger.error('pikku-cloudflare: MCP could not be mounted', e)
        return null
      })
      const mcp = await mounted
      if (mcp && mcp.ownsPath(new URL(request.url).pathname)) {
        return mcp.handler(request)
      }
      return runFetch(request)
    }

    async runRpc(name: string, args: unknown): Promise<unknown> {
      const services = await setupServices(this.env, factories)
      const rpc = rpcService.getContextRPCService(
        services as any,
        {},
        false
      ) as any
      return rpc.invoke(name, args)
    }
  }
}
