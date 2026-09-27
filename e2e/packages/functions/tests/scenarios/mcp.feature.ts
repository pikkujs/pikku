/**
 * A remote MCP server has to do two opposite things at the same endpoint: let an
 * unauthenticated client see and use what is public, and tell it where to get a
 * token for what is not. These scenarios drive both through the real MCP client
 * SDK, because "tells it" is a claim about what a client does with our response,
 * not about the bytes we sent.
 *
 * The two tools are declared in `mcp.functions.ts` and differ only in their
 * factory — `mcpPublicCatalogue` is a `pikkuSessionlessFunc`, `mcpWhoAmITool` a
 * `pikkuFunc`. Nothing else was configured to make one of them private, which is
 * the property worth pinning: the gate is the flag an app author already writes.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'
import { GUEST_USER } from '../../../../src/auth-fixtures.js'

const PUBLIC_TOOL = 'mcpPublicCatalogue'
const PRIVATE_TOOL = 'mcpWhoAmITool'

export const mcpPublicToolIsReachableScenario = pikkuScenario<
  void,
  { ok: true }
>({
  title: 'A client with no credentials sees the catalogue and calls it',
  description:
    'A sessionless tool is public, and listing is never gated — otherwise a client cannot discover what it would authenticate for',
  tags: ['scenario', 'mcp'],
  func: async (_services, _data, { scenario }) => {
    const catalogue = await scenario.when(
      'an anonymous MCP client lists the tools',
      'listsMcpTools',
      {}
    )
    await scenario.then('both tools are offered', 'expectsMcpCatalogue', {
      catalogue,
      includes: [PUBLIC_TOOL, PRIVATE_TOOL],
    })
    const call = await scenario.when(
      'it calls the public tool',
      'callsMcpTool',
      { name: PUBLIC_TOOL }
    )
    await scenario.then('the tool runs', 'expectsMcpToolCall', {
      call,
      ok: true,
      unauthorized: false,
      contains: 'catalogue',
    })
    return { ok: true as const }
  },
})

export const mcpPrivateToolChallengesScenario = pikkuScenario<
  void,
  { ok: true }
>({
  title:
    'A client with no credentials is told to authenticate, not that a tool broke',
  description:
    'The refusal reaches the SDK as UnauthorizedError, which is what starts an OAuth flow — a JSON-RPC error result would read as a working server returning a failure',
  tags: ['scenario', 'mcp'],
  func: async (_services, _data, { scenario }) => {
    const call = await scenario.when(
      'an anonymous MCP client calls the private tool',
      'callsMcpTool',
      { name: PRIVATE_TOOL }
    )
    await scenario.then(
      'the client raises UnauthorizedError',
      'expectsMcpToolCall',
      { call, ok: false, unauthorized: true }
    )
    const metadata = await scenario.when(
      'it follows its own discovery for the endpoint',
      'discoversMcpResourceMetadata',
      undefined
    )
    await scenario.then(
      'it finds a document describing this endpoint',
      'expectsMcpResourceMetadata',
      { metadata }
    )
    return { ok: true as const }
  },
})

export const mcpPrivateToolRunsWithATokenScenario = pikkuScenario<
  void,
  { ok: true }
>({
  title: 'The same private tool runs once the client carries a token',
  description:
    'The challenge is not a wall: a client that authenticates reaches the tool, and it runs as the user who signed in',
  tags: ['scenario', 'mcp'],
  func: async (_services, _data, { scenario }) => {
    const signIn = await scenario.given(
      'a signed-in bearer token',
      'takesBearerTokenForMcp',
      { email: GUEST_USER.email, password: GUEST_USER.password }
    )
    const call = await scenario.when(
      'the client calls the private tool with it',
      'callsMcpTool',
      { name: PRIVATE_TOOL, token: signIn.token }
    )
    await scenario.then(
      'the tool runs as the signed-in user',
      'expectsMcpToolCall',
      { call, ok: true, unauthorized: false, contains: 'signed in as' }
    )
    return { ok: true as const }
  },
})

export const mcpFeature = pikkuFeature({
  name: 'MCP authentication',
  description:
    'One endpoint serving a public tool and a private one, driven by the real MCP client SDK',
  tags: ['mcp'],
  scenarios: [
    mcpPublicToolIsReachableScenario,
    mcpPrivateToolChallengesScenario,
    mcpPrivateToolRunsWithATokenScenario,
  ],
})
