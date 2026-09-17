import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  mcpEveryTargetRequiresSession,
  mcpResolveWireName,
  mcpTargetRequiresSession,
  mcpWireName,
} from './mcp-runner.js'

const registerTool = (
  name: string,
  funcMeta: { sessionless: boolean; auth?: boolean } = { sessionless: false }
) => {
  pikkuState(null, 'mcp', 'toolsMeta')[name] = {
    name,
    title: name,
    description: name,
    pikkuFuncId: `${name}Func`,
    inputSchema: null,
    outputSchema: 'MCPToolResponse',
  } as never
  pikkuState(null, 'function', 'meta')[`${name}Func`] = {
    name: `${name}Func`,
    permissions: [],
    ...funcMeta,
  } as never
}

beforeEach(() => {
  resetPikkuState()
})

/**
 * Names as a client is allowed to spell them.
 *
 * MCP constrains tool and prompt names to `[A-Za-z0-9_-]`, and pikku's
 * namespace separator is `:`. Clients drop the names they cannot accept rather
 * than failing the connection, so an addon's whole surface went missing
 * silently. The rewrite lives at the transport boundary; the registry keeps
 * its own spelling, because that is what dispatch keys on.
 */
describe('mcpWireName', () => {
  test('leaves an already-legal name alone', () => {
    assert.equal(mcpWireName('listProducts'), 'listProducts')
    assert.equal(mcpWireName('list_products-2'), 'list_products-2')
  })

  test('rewrites the namespace separator', () => {
    assert.equal(mcpWireName('bb2:getMe'), 'bb2_getMe')
  })

  test('rewrites every other character a client would refuse', () => {
    assert.equal(mcpWireName('a.b c/d:e'), 'a_b_c_d_e')
  })
})

describe('mcpResolveWireName', () => {
  test('resolves a rewritten name back to the registered one', () => {
    registerTool('bb2:getMe')
    assert.equal(mcpResolveWireName('tool', 'bb2_getMe'), 'bb2:getMe')
  })

  test('returns a registered name unchanged', () => {
    registerTool('listProducts')
    assert.equal(mcpResolveWireName('tool', 'listProducts'), 'listProducts')
  })

  test('prefers an exact registration over a rewritten match', () => {
    // The rewrite is lossy in principle: these two collapse to one wire name.
    // A tool actually registered under the wire spelling must win, or a client
    // asking for the one it can see would be handed the other.
    registerTool('bb2_getMe')
    registerTool('bb2:getMe')
    assert.equal(mcpResolveWireName('tool', 'bb2_getMe'), 'bb2_getMe')
  })

  test('hands back an unknown name unchanged, for the runner to refuse', () => {
    assert.equal(mcpResolveWireName('tool', 'nope'), 'nope')
  })

  test('resolves per target type', () => {
    pikkuState(null, 'mcp', 'promptsMeta')['bb2:draft'] = {
      name: 'bb2:draft',
    } as never
    assert.equal(mcpResolveWireName('prompt', 'bb2_draft'), 'bb2:draft')
    assert.equal(mcpResolveWireName('tool', 'bb2_draft'), 'bb2_draft')
  })
})

describe('mcpTargetRequiresSession accepts a wire name', () => {
  test('a gated namespaced tool is still gated when asked for by wire name', () => {
    registerTool('bb2:getMe', { sessionless: false })
    assert.equal(mcpTargetRequiresSession('tool', 'bb2_getMe'), true)
  })

  test('an open namespaced tool is still open', () => {
    registerTool('bb2:ping', { sessionless: true })
    assert.equal(mcpTargetRequiresSession('tool', 'bb2_ping'), false)
  })
})

/**
 * Whether the handshake itself should be challenged.
 *
 * A client decides at connection time whether a server speaks OAuth, and all it
 * has to go on is whether `initialize` was challenged. Answering `200` and then
 * refusing every tool tells it "no sign-in needed" and then gives it nothing.
 */
describe('mcpEveryTargetRequiresSession', () => {
  test('an empty registry is not "all gated" — there is nothing to gate', () => {
    assert.equal(mcpEveryTargetRequiresSession(), false)
  })

  test('true when every registered target needs a session', () => {
    registerTool('checkout', { sessionless: false })
    registerTool('bb2:getMe', { sessionless: false })
    assert.equal(mcpEveryTargetRequiresSession(), true)
  })

  test('false when even one target is open', () => {
    registerTool('checkout', { sessionless: false })
    registerTool('search', { sessionless: true })
    assert.equal(mcpEveryTargetRequiresSession(), false)
  })

  test('a sessionless tool declaring auth: true counts as gated', () => {
    registerTool('myOrders', { sessionless: true, auth: true })
    assert.equal(mcpEveryTargetRequiresSession(), true)
  })

  test('prompts and resources count too', () => {
    registerTool('checkout', { sessionless: false })
    pikkuState(null, 'mcp', 'promptsMeta').draft = {
      name: 'draft',
      pikkuFuncId: 'draftFunc',
    } as never
    pikkuState(null, 'function', 'meta').draftFunc = {
      name: 'draftFunc',
      permissions: [],
      sessionless: true,
    } as never
    assert.equal(mcpEveryTargetRequiresSession(), false)
  })
})
