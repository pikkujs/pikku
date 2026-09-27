/**
 * The MCP endpoint driven through the REAL MCP client SDK — `Client` over
 * `StreamableHTTPClientTransport`, the same pair Claude Desktop and every other
 * MCP host uses. Nothing here hand-rolls a JSON-RPC frame or reads a header the
 * SDK would read for it.
 *
 * That is the whole point of these steps. The unit tests and the verifier assert
 * that the server *emits* a `401` and a `WWW-Authenticate` challenge; only a real
 * client tells us whether that is the shape a client acts on — whether it raises
 * `UnauthorizedError` rather than surfacing a failed tool, and whether its own
 * RFC 9728 discovery finds the document the challenge names. Both are the SDK's
 * rules, not ours, and neither is something we can assert by inspecting our own
 * output.
 *
 * A client is created and discarded inside a single step: a step result must be
 * JSON and an open transport is not. That costs one `initialize` per step, which
 * is what a host does per connection anyway.
 */
import { pikkuScenarioStep, requireScenarioEnv } from '#pikku/scenario'
import {
  Client,
  StreamableHTTPClientTransport,
  UnauthorizedError,
  discoverOAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/client'
import { createAuthClient } from 'better-auth/client'

const mcpUrl = (apiUrl: string) => new URL('/mcp', apiUrl)

/**
 * Connects a client, runs one interaction, and closes it.
 *
 * The `AuthProvider` is always present and its `token()` is allowed to answer
 * `undefined`, which is exactly the state a host is in before it has
 * authenticated — the SDK documents that return as supported. It matters
 * because the transport only reads a `401` as an authentication challenge when
 * a provider exists: with none, a client has nothing to do with the answer and
 * the SDK reports a plain HTTP failure. Handing an empty provider is therefore
 * what a host actually does on first connect, and what makes the difference
 * between `UnauthorizedError` and "the tool broke" observable at all.
 */
const withClient = async <T>(
  apiUrl: string,
  token: string | undefined,
  use: (client: Client) => Promise<T>
): Promise<T> => {
  const transport = new StreamableHTTPClientTransport(mcpUrl(apiUrl), {
    authProvider: { token: async () => token },
  })
  const client = new Client({ name: 'pikku-e2e', version: '1.0.0' })
  try {
    await client.connect(transport)
    return await use(client)
  } finally {
    await client.close().catch(() => {})
  }
}

/** What a real client saw when it asked the server what it offers. */
export interface McpCatalogue {
  toolNames: string[]
}

export const listsMcpTools = pikkuScenarioStep<
  { token?: string },
  McpCatalogue
>({
  name: 'listsMcpTools',
  description: 'connects a real MCP client and lists the tools it is offered',
  template: 'lists the tools the MCP server offers',
  default: async (_services, { token }, { scenarioStep }) => {
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    return withClient(apiUrl, token, async (client) => {
      const { tools } = await client.listTools()
      return { toolNames: tools.map((tool) => tool.name).sort() }
    })
  },
})

/**
 * The outcome of a tool call.
 *
 * `unauthorized` is deliberately separate from `error`: the distinction this
 * whole change exists to create is between "the client was told to
 * authenticate" and "the tool ran and failed", and collapsing both into a
 * message would let the old behaviour pass.
 */
export interface McpToolCall {
  ok: boolean
  text?: string
  unauthorized: boolean
  error?: string
}

export const callsMcpTool = pikkuScenarioStep<
  { name: string; token?: string },
  McpToolCall
>({
  name: 'callsMcpTool',
  description: 'calls a tool through a real MCP client',
  template: 'calls {name} over MCP',
  default: async (_services, { name, token }, { scenarioStep }) => {
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    try {
      return await withClient(apiUrl, token, async (client) => {
        const result = await client.callTool({ name, arguments: {} })
        const content = (result.content ?? []) as Array<{ text?: string }>
        return {
          ok: result.isError !== true,
          text: content.map((block) => block.text ?? '').join(''),
          unauthorized: false,
        }
      })
    } catch (error) {
      return {
        ok: false,
        unauthorized: UnauthorizedError.isInstance(error),
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

/** The discovery document, as the SDK's own RFC 9728 lookup resolved it. */
export interface McpResourceMetadata {
  found: boolean
  resource?: string
  authorizationServers?: string[]
  error?: string
}

export const discoversMcpResourceMetadata = pikkuScenarioStep<
  void,
  McpResourceMetadata
>({
  name: 'discoversMcpResourceMetadata',
  description:
    "follows the SDK's own protected resource discovery for the endpoint",
  template: 'discovers where the MCP server wants a token from',
  default: async (_services, _data, { scenarioStep }) => {
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    try {
      const metadata = await discoverOAuthProtectedResourceMetadata(
        mcpUrl(apiUrl)
      )
      return {
        found: true,
        resource: metadata.resource,
        authorizationServers: metadata.authorization_servers,
      }
    } catch (error) {
      return {
        found: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

/**
 * Signs in and hands back a bearer token the MCP transport can carry.
 *
 * Better Auth's `bearer()` plugin returns the session token in `set-auth-token`,
 * which is the one credential an MCP client can present — it has no cookie jar
 * and no browser. Reading it here is what lets the authenticated half of the
 * suite use the same session machinery every other caller does.
 */
export const takesBearerTokenForMcp = pikkuScenarioStep<
  { email: string; password: string },
  { token?: string; error?: string }
>({
  name: 'takesBearerTokenForMcp',
  description: 'signs in and keeps the bearer token for an MCP client',
  template: 'signs in as {email} and keeps a bearer token',
  default: async (_services, { email, password }, { scenarioStep }) => {
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    let token: string | undefined
    const client = createAuthClient({
      baseURL: apiUrl,
      fetchOptions: {
        headers: { origin: apiUrl },
        onSuccess: (context) => {
          token = context.response.headers.get('set-auth-token') ?? undefined
        },
      },
    })
    const { error } = await client.signIn.email({ email, password })
    if (error) {
      return { error: JSON.stringify(error) }
    }
    return { token }
  },
})

export const expectsMcpCatalogue = pikkuScenarioStep<
  { catalogue: McpCatalogue; includes: string[] },
  { toolNames: string[] }
>({
  name: 'expectsMcpCatalogue',
  description: 'expects the listed tools to include the named ones',
  template: 'expects the catalogue to include {includes}',
  default: async (_services, { catalogue, includes }) => {
    for (const name of includes) {
      if (!catalogue.toolNames.includes(name)) {
        throw new Error(
          `Expected the MCP catalogue to offer ${name}, got ${catalogue.toolNames.join(', ')}`
        )
      }
    }
    return { toolNames: catalogue.toolNames }
  },
})

export const expectsMcpToolCall = pikkuScenarioStep<
  {
    call: McpToolCall
    ok?: boolean
    unauthorized?: boolean
    contains?: string
  },
  { ok: boolean }
>({
  name: 'expectsMcpToolCall',
  description: 'expects what the MCP client made of a tool call',
  template: 'expects the call to have been accepted: {ok}',
  default: async (_services, { call, ok, unauthorized, contains }) => {
    const seen = JSON.stringify(call)
    if (ok !== undefined && call.ok !== ok) {
      throw new Error(`Expected ok to be ${ok}, got ${seen}`)
    }
    if (unauthorized !== undefined && call.unauthorized !== unauthorized) {
      throw new Error(
        `Expected unauthorized to be ${unauthorized}, got ${seen}`
      )
    }
    if (contains !== undefined && !(call.text ?? '').includes(contains)) {
      throw new Error(`Expected the result to contain ${contains}, got ${seen}`)
    }
    return { ok: call.ok }
  },
})

export const expectsMcpResourceMetadata = pikkuScenarioStep<
  { metadata: McpResourceMetadata },
  { resource: string }
>({
  name: 'expectsMcpResourceMetadata',
  description: 'expects discovery to have found the endpoint it describes',
  template: 'expects the document to describe the MCP endpoint',
  default: async (_services, { metadata }, { scenarioStep }) => {
    const resource = mcpUrl(requireScenarioEnv(scenarioStep).apiUrl).href
    if (!metadata.found) {
      throw new Error(
        `Expected the protected resource metadata to be discoverable, got ${metadata.error}`
      )
    }
    if (metadata.resource !== resource) {
      throw new Error(
        `Expected the document to describe ${resource}, got ${metadata.resource}`
      )
    }
    if ((metadata.authorizationServers ?? []).length === 0) {
      throw new Error(
        'Expected the document to name at least one authorization server'
      )
    }
    return { resource: metadata.resource }
  },
})
