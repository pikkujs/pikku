import { mcpTargetRequiresSession } from '@pikku/core/mcp'
import {
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
  type OAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/server'

/**
 * What an MCP server tells a client about the token it wants.
 *
 * Every field has a working default drawn from the request the client just
 * made, because the common pikku deployment is its own authorization server —
 * the app's better-auth mount and its MCP endpoint share an origin — and a
 * discovery document nobody has to configure is one that cannot drift from the
 * server it describes.
 */
export type MCPAuthOptions = {
  /**
   * Issuer URLs of the authorization servers that mint tokens for this server,
   * advertised as `authorization_servers`. Defaults to the origin the MCP
   * request arrived on.
   */
  authorizationServers?: string[]
  /** Scopes this server understands, advertised as `scopes_supported`. */
  scopesSupported?: string[]
  /** A human-readable name for the resource, advertised as `resource_name`. */
  resourceName?: string
}

const WELL_KNOWN_PRM = '/.well-known/oauth-protected-resource'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, MCP-Protocol-Version',
}

/** The public URL of the MCP endpoint itself, as the caller reached it. */
const resourceUrl = (request: Request, mcpPath: string): URL =>
  new URL(mcpPath, new URL(request.url).origin)

/**
 * The URL to name in a `WWW-Authenticate` challenge, per RFC 9728.
 *
 * The resource's path is folded into the well-known route rather than appended
 * to it, so `/mcp` is advertised at `/.well-known/oauth-protected-resource/mcp`.
 */
export const protectedResourceMetadataUrl = (
  request: Request,
  mcpPath: string
): string => getOAuthProtectedResourceMetadataUrl(resourceUrl(request, mcpPath))

const buildMetadata = (
  request: Request,
  mcpPath: string,
  options?: MCPAuthOptions
): OAuthProtectedResourceMetadata => {
  const resource = resourceUrl(request, mcpPath)
  const metadata: OAuthProtectedResourceMetadata = {
    resource: resource.href,
    authorization_servers: options?.authorizationServers ?? [
      new URL('/', resource).href,
    ],
    bearer_methods_supported: ['header'],
  }
  if (options?.scopesSupported) {
    metadata.scopes_supported = options.scopesSupported
  }
  if (options?.resourceName) {
    metadata.resource_name = options.resourceName
  }
  return metadata
}

/**
 * Serve the RFC 9728 Protected Resource Metadata document, or `undefined` when
 * the request is for something else and should fall through to MCP dispatch.
 *
 * Both the path-aware route and the bare one are answered: the challenge names
 * the first, but clients that predate path-aware discovery probe the second,
 * and a server that 404s there leaves them with nowhere to go.
 */
export const protectedResourceMetadataResponse = (
  request: Request,
  mcpPath: string,
  options?: MCPAuthOptions
): Response | undefined => {
  const { pathname } = new URL(request.url)
  const pathAware = new URL(protectedResourceMetadataUrl(request, mcpPath))
    .pathname
  if (pathname !== pathAware && pathname !== WELL_KNOWN_PRM) {
    return undefined
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {
      status: 405,
      headers: { ...corsHeaders, Allow: 'GET, HEAD, OPTIONS' },
    })
  }
  return new Response(
    JSON.stringify(buildMetadata(request, mcpPath, options)),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
}

/**
 * The `401` answer to a call that was refused for want of a session.
 *
 * JSON-RPC can only report the refusal as a result, which a client reads as a
 * tool that failed rather than one it is not yet allowed to call. The status
 * and the `WWW-Authenticate` challenge are what start OAuth discovery, so the
 * refusal has to be raised at the HTTP layer to mean anything.
 */
export const unauthorizedResponse = (
  request: Request,
  mcpPath: string,
  options?: MCPAuthOptions
): Response =>
  bearerAuthChallengeResponse(
    new OAuthError(OAuthErrorCode.InvalidToken, 'Authentication required'),
    {
      resourceMetadataUrl: protectedResourceMetadataUrl(request, mcpPath),
      requiredScopes: options?.scopesSupported,
    }
  )

/**
 * Whether the MCP handler is the one that should answer this path.
 *
 * The discovery document does not live under the endpoint — RFC 9728 folds the
 * resource's path into the well-known route, so `/mcp` is described at
 * `/.well-known/oauth-protected-resource/mcp`. A host routing on `mcpPath`
 * alone would `404` the very document its own challenge points at.
 */
export const isMCPPath = (pathname: string, mcpPath: string): boolean =>
  pathname === mcpPath ||
  pathname.startsWith(`${mcpPath}/`) ||
  pathname === WELL_KNOWN_PRM ||
  pathname === `${WELL_KNOWN_PRM}${mcpPath}`

/** The JSON-RPC methods that reach a pikku function, and what names their target. */
const GATED_METHODS: Record<string, ['tool' | 'resource' | 'prompt', string]> =
  {
    'tools/call': ['tool', 'name'],
    'resources/read': ['resource', 'uri'],
    'prompts/get': ['prompt', 'name'],
  }

/**
 * Whether this request must be refused at the door for carrying no credentials.
 *
 * The status and `WWW-Authenticate` header have to be chosen before the
 * response starts, and the response streams — so by the time the runner refuses
 * a call, the `200` is already on its way. The decision is therefore made here,
 * from the two things knowable up front: which target the body names, and
 * whether the request presents anything to authenticate with.
 *
 * Only a request with *no* credentials is refused. A token that is present but
 * expired or wrong is dispatched, and the runner's refusal reaches the client
 * as a tool error rather than a challenge; verifying it here would mean the
 * transport second-guessing the middleware that owns session resolution.
 */
export const requestNeedsCredentials = async (
  request: Request
): Promise<boolean> => {
  if (request.method !== 'POST') {
    return false
  }
  if (request.headers.get('Authorization') || request.headers.get('Cookie')) {
    return false
  }

  let body: unknown
  try {
    body = await request.clone().json()
  } catch {
    return false
  }

  const messages = Array.isArray(body) ? body : [body]
  return messages.some((message) => {
    const target = GATED_METHODS[(message as { method?: string })?.method ?? '']
    if (!target) {
      return false
    }
    const [type, param] = target
    const name = (message as { params?: Record<string, unknown> })?.params?.[
      param
    ]
    return typeof name === 'string' && mcpTargetRequiresSession(type, name)
  })
}
