import type { PikkuRawWire } from '../../types/core.types.js'
import type { PikkuHTTP } from '../http/http.types.js'
import type {
  CoreMCPResource,
  CoreMCPPrompt,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcErrorResponse,
  PikkuMCP,
} from './mcp.types.js'
import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'
import { getErrorResponse } from '../../errors/error-handler.js'
import { isProduction } from '../../env.js'
import {
  pikkuState,
  getSingletonServices,
  getCreateWireServices,
} from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { resolveNamespace } from '../rpc/rpc-runner.js'
import { BadRequestError, NotFoundError } from '../../errors/errors.js'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../../services/user-session-service.js'
export class MCPError extends Error {
  constructor(public readonly error: JsonRpcErrorResponse) {
    super(error?.message || 'MCP Error')
    this.name = 'MCPError'
    this.stack = new Error().stack
  }
}

export type RunMCPEndpointParams<Tools extends string = any> = {
  mcp?: PikkuMCP<Tools>
  /**
   * The HTTP request the MCP call arrived on, when it arrived over HTTP.
   *
   * Auth middleware reads the session off `wire.http.request` — every
   * implementation opens with `if (!http?.request) return` — so without this an
   * MCP call reaches the function unauthenticated no matter what middleware the
   * app has registered, and a tool fronting a session-requiring function can
   * only ever answer 'Authentication required'.
   *
   * Left undefined for transports that have no request to offer, such as stdio.
   * Those remain anonymous, which is a property of the transport rather than a
   * default chosen here.
   */
  http?: PikkuHTTP
  /** Defaults to enabled outside production. */
  exposeErrors?: boolean
}

export const wireMCPResource = <
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, any>
  > = CorePikkuFunctionConfig<CorePikkuFunctionSessionless<any, any>>,
>(
  mcpResource: CoreMCPResource<PikkuFunctionConfig>
) => {
  const resourcesMeta = pikkuState(null, 'mcp', 'resourcesMeta')
  const mcpResourceMeta = resourcesMeta[mcpResource.uri]
  if (!mcpResourceMeta) {
    console.warn(
      `[pikku] Skipping MCP resource '${mcpResource.uri}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
  }
  addFunction(mcpResourceMeta.pikkuFuncId, mcpResource.func)
  const resources = pikkuState(null, 'mcp', 'resources')
  if (resources.has(mcpResource.uri)) {
    throw new Error(`MCP resource already exists: ${mcpResource.uri}`)
  }
  resources.set(mcpResource.uri, mcpResource)
}

export const wireMCPPrompt = <
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, any>
  > = CorePikkuFunctionConfig<CorePikkuFunctionSessionless<any, any>>,
>(
  mcpPrompt: CoreMCPPrompt<PikkuFunctionConfig>
) => {
  const promptsMeta = pikkuState(null, 'mcp', 'promptsMeta')
  const mcpPromptMeta = promptsMeta[mcpPrompt.name]
  if (!mcpPromptMeta) {
    console.warn(
      `[pikku] Skipping MCP prompt '${mcpPrompt.name}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
  }
  addFunction(mcpPromptMeta.pikkuFuncId, mcpPrompt.func)
  const prompts = pikkuState(null, 'mcp', 'prompts')
  if (prompts.has(mcpPrompt.name)) {
    throw new Error(`MCP prompt already exists: ${mcpPrompt.name}`)
  }
  prompts.set(mcpPrompt.name, mcpPrompt)
}

export async function runMCPResource(
  request: JsonRpcRequest,
  params: RunMCPEndpointParams,
  uri: string
) {
  let endpoint: CoreMCPResource | undefined
  let pikkuFuncId: string | undefined
  let extractedParams: Record<string, string> = {}

  const metas = pikkuState(null, 'mcp', 'resourcesMeta')
  const endpoints = pikkuState(null, 'mcp', 'resources')

  // The key the resource's meta (and its middleware) is stored under. For a
  // templated resource this is the template, not the concrete request URI — so
  // it must be carried forward, or the meta lookup downstream misses and the
  // resource's declared middleware (including auth) is silently skipped.
  let metaKey = uri

  if (endpoints.has(uri)) {
    endpoint = endpoints.get(uri)
    pikkuFuncId = metas[uri]?.pikkuFuncId
  } else {
    for (const [uriTemplate, value] of endpoints.entries()) {
      const paramNames = Array.from(
        uriTemplate.matchAll(/\{([^}]+)\}/g),
        (m) => m[1]
      )

      const regexPattern = uriTemplate.replace(/\{[^}]+\}/g, '([^/]+)')
      const regex = new RegExp(`^${regexPattern}$`)
      const match = uri.match(regex)

      if (match) {
        endpoint = value
        metaKey = uriTemplate
        pikkuFuncId = metas[uriTemplate]?.pikkuFuncId

        for (let i = 0; i < paramNames.length; i++) {
          extractedParams[paramNames[i]!] = match[i + 1]! // match[0] is the full match
        }
        break
      }
    }
  }

  return await runMCPPikkuFunc(
    {
      ...request,
      params: { ...request.params, ...extractedParams },
    },
    'resource',
    uri,
    endpoint,
    pikkuFuncId,
    { ...params, mcp: { ...params.mcp, uri } } as RunMCPEndpointParams<
      keyof CoreMCPResource
    >,
    metaKey
  )
}

export async function runMCPTool(
  request: JsonRpcRequest,
  params: RunMCPEndpointParams,
  name: string
) {
  const meta = pikkuState(null, 'mcp', 'toolsMeta')[name]
  return await runMCPPikkuFunc(
    request,
    'tool',
    name,
    undefined,
    meta?.pikkuFuncId,
    params
  )
}

export async function runMCPPrompt(
  request: JsonRpcRequest,
  params: RunMCPEndpointParams,
  name: string
) {
  const endpoint = pikkuState(null, 'mcp', 'prompts').get(name)
  const meta = pikkuState(null, 'mcp', 'promptsMeta')[name]
  return await runMCPPikkuFunc(
    request,
    'prompt',
    name,
    endpoint,
    meta?.pikkuFuncId,
    params
  )
}

async function runMCPPikkuFunc(
  request: JsonRpcRequest,
  type: 'resource' | 'tool' | 'prompt',
  name: string,
  mcp: CoreMCPResource | CoreMCPPrompt | undefined,
  pikkuFuncId: string | undefined,
  { mcp: mcpWire, http, exposeErrors = !isProduction() }: RunMCPEndpointParams,
  // The key the endpoint's meta is stored under. Differs from `name` only for a
  // templated resource, where `name` is the concrete URI and the meta lives
  // under the template. Defaults to `name` for tools and prompts.
  metaKey: string = name
): Promise<JsonRpcResponse> {
  const singletonServices = getSingletonServices()
  const createWireServices = getCreateWireServices()

  try {
    if (request.jsonrpc !== '2.0') {
      throw new BadRequestError(
        'Invalid JSON-RPC version, only supoorted version is 2.0'
      )
    }

    if (mcp === undefined && type !== 'tool') {
      throw new NotFoundError(
        `MCP '${type}' registration not found for '${name}'`
      )
    }

    if (!pikkuFuncId) {
      throw new NotFoundError(
        `MCP '${type}' PikkuFunction Mapping not found for '${name}'`
      )
    }

    singletonServices.logger.debug(`Running MCP ${type}: ${name}`)

    const mcpSessionService = new PikkuSessionService(
      singletonServices.sessionStore
    )
    const wire: PikkuRawWire = {
      mcp: mcpWire,
      // Only when the transport supplied one. Setting `http: undefined`
      // explicitly would be the same to a reader and different to a spread.
      ...(http ? { http } : {}),
      ...createMiddlewareSessionWireProps(mcpSessionService),
    }

    let meta: any
    if (type === 'resource') {
      meta = pikkuState(null, 'mcp', 'resourcesMeta')[metaKey]
    } else if (type === 'tool') {
      meta = pikkuState(null, 'mcp', 'toolsMeta')[metaKey]
    } else if (type === 'prompt') {
      meta = pikkuState(null, 'mcp', 'promptsMeta')[metaKey]
    }

    let resolvedFuncName = pikkuFuncId
    let resolvedPackageName: string | null = meta?.packageName ?? null
    if (pikkuFuncId.includes(':')) {
      const resolved = resolveNamespace(pikkuFuncId)
      if (resolved) {
        resolvedFuncName = resolved.function
        resolvedPackageName = resolved.package
      }
    }

    let result = await runPikkuFunc(
      'mcp',
      `${type}:${name}`,
      resolvedFuncName,
      {
        singletonServices,
        createWireServices,
        data: () => request.params,
        inheritedMiddleware: meta?.middleware,
        wireMiddleware: mcp?.middleware,
        tags: mcp?.tags,
        wire,
        sessionService: mcpSessionService,
        packageName: resolvedPackageName,
      }
    )

    if (type === 'tool' && meta?.outputSchema !== 'MCPToolResponse') {
      result = [{ type: 'text', text: JSON.stringify(result) }]
    }

    return {
      id: request.id,
      result,
    }
  } catch (e: any) {
    singletonServices.logger.error(
      `Error running MCP ${type} '${name}':`,
      e.constructor
    )
    const errorResponse = getErrorResponse(e)
    if (errorResponse?.mcpCode) {
      throw new MCPError({
        id: request.id,
        code: errorResponse.mcpCode,
        message: errorResponse.message,
      })
    } else {
      if (errorResponse) {
        singletonServices.logger.warn(
          `Got error without a mapping: ${errorResponse.message}`
        )
      }
      throw new MCPError({
        id: request.id,
        code: -32603,
        message: 'Internal error',
        // knowledge: decisions/security/mcp-internal-error-details-are-double-gated-on-production.md
        data:
          exposeErrors && !isProduction() && e instanceof Error
            ? { message: e.message, stack: e.stack }
            : undefined,
      })
    }
  }
}

export const getMCPResourcesMeta = () => {
  return pikkuState(null, 'mcp', 'resourcesMeta')
}

export const getMCPToolsMeta = () => {
  return pikkuState(null, 'mcp', 'toolsMeta')
}

export const getMCPPromptsMeta = () => {
  return pikkuState(null, 'mcp', 'promptsMeta')
}

/**
 * Whether a call to this MCP target would need a session to run.
 *
 * Read from the same declarations the runner enforces: a `pikkuFunc` always
 * needs one, and a `pikkuSessionlessFunc` needs one only where it says
 * `auth: true`. A transport asks this to answer an unauthenticated call with a
 * `401` challenge instead of dispatching it — the status and the
 * `WWW-Authenticate` header have to be chosen before the response starts, which
 * is earlier than the refusal itself can be known.
 *
 * Unknown targets are treated as open: a name nobody registered is a
 * `Method not found`, and answering it with a challenge would invite a client
 * to authenticate its way towards a tool that does not exist.
 */
export const mcpTargetRequiresSession = (
  type: 'tool' | 'resource' | 'prompt',
  name: string
): boolean => {
  // The transport passes the name exactly as the client sent it, which is the
  // wire spelling — see `mcpWireName`.
  name = mcpResolveWireName(type, name)
  const meta =
    type === 'tool'
      ? pikkuState(null, 'mcp', 'toolsMeta')[name]
      : type === 'resource'
        ? pikkuState(null, 'mcp', 'resourcesMeta')[name]
        : pikkuState(null, 'mcp', 'promptsMeta')[name]
  if (!meta) {
    return false
  }

  let funcName = meta.pikkuFuncId
  let packageName: string | null = null
  if (funcName.includes(':')) {
    const resolved = resolveNamespace(funcName)
    if (resolved) {
      funcName = resolved.function
      packageName = resolved.package
    }
  }

  const funcMeta = pikkuState(packageName, 'function', 'meta')[funcName]
  if (!funcMeta) {
    return false
  }
  return !funcMeta.sessionless || funcMeta.auth === true
}

/**
 * Whether every registered MCP target needs a session — i.e. whether this
 * server has nothing at all to offer an anonymous caller.
 *
 * A client decides at connection time whether a server speaks OAuth, and the
 * only thing it can decide from is whether the handshake was challenged. A
 * server that answers `initialize` with a `200` and then `401`s every single
 * tool call has told the client "no sign-in needed" and then refused it
 * everything — which is how a fully-gated server ends up detected as open.
 *
 * So the handshake is challenged too, but only when the answer here is yes.
 * A server with even one open target genuinely is usable anonymously, and
 * challenging its handshake would lock out clients that have no credentials
 * to offer. An empty registry is not "all gated" — there is nothing to gate.
 */
export const mcpEveryTargetRequiresSession = (): boolean => {
  const targets: Array<['tool' | 'resource' | 'prompt', string[]]> = [
    ['tool', Object.keys(pikkuState(null, 'mcp', 'toolsMeta'))],
    ['resource', Object.keys(pikkuState(null, 'mcp', 'resourcesMeta'))],
    ['prompt', Object.keys(pikkuState(null, 'mcp', 'promptsMeta'))],
  ]
  let seen = 0
  for (const [type, names] of targets) {
    for (const name of names) {
      seen++
      if (!mcpTargetRequiresSession(type, name)) {
        return false
      }
    }
  }
  return seen > 0
}

/**
 * How a target's name is spelled on the wire.
 *
 * MCP clients constrain tool and prompt names to `[A-Za-z0-9_-]`. Pikku's
 * namespace separator is `:`, so every target contributed by an addon —
 * `bb2:getMe` and friends — is a name the client cannot accept, and clients
 * drop them from the session rather than fail the connection. The names are
 * therefore rewritten at the transport boundary and resolved back on the way
 * in; the namespace itself is untouched, since it is what dispatch keys on.
 */
export const mcpWireName = (name: string): string =>
  name.replace(/[^A-Za-z0-9_-]/g, '_')

/**
 * The registered name a client's wire name refers to.
 *
 * A name that is already registered is returned as-is: rewriting is lossy in
 * principle (`a:b` and `a_b` collapse together), so an exact match always wins
 * over a rewritten one, and a name matching nothing is handed back unchanged
 * for the runner to report as `Method not found`.
 */
export const mcpResolveWireName = (
  type: 'tool' | 'resource' | 'prompt',
  wireName: string
): string => {
  const meta =
    type === 'tool'
      ? pikkuState(null, 'mcp', 'toolsMeta')
      : type === 'resource'
        ? pikkuState(null, 'mcp', 'resourcesMeta')
        : pikkuState(null, 'mcp', 'promptsMeta')
  if (meta[wireName]) {
    return wireName
  }
  return (
    Object.keys(meta).find((name) => mcpWireName(name) === wireName) ?? wireName
  )
}
