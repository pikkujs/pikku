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
 * See `mcp-wire-names-are-assigned-over-the-whole-registry.md`.
 */
describe('mcpWireName', () => {
  test('leaves an already-legal name alone', () => {
    registerTool('listProducts')
    registerTool('list_products-2')
    assert.equal(mcpWireName('tool', 'listProducts'), 'listProducts')
    assert.equal(mcpWireName('tool', 'list_products-2'), 'list_products-2')
  })

  test('rewrites the namespace separator', () => {
    registerTool('bb2:getMe')
    assert.equal(mcpWireName('tool', 'bb2:getMe'), 'bb2_getMe')
  })

  test('rewrites every other character a client would refuse', () => {
    registerTool('a.b c/d:e')
    assert.equal(mcpWireName('tool', 'a.b c/d:e'), 'a_b_c_d_e')
  })

  test('gives colliding names distinct wire names', () => {
    registerTool('a:b')
    registerTool('a.b')
    const wire = ['a:b', 'a.b'].map((n) => mcpWireName('tool', n))
    assert.equal(new Set(wire).size, 2, `both advertised as ${wire[0]}`)
    for (const w of wire) {
      assert.match(w, /^[A-Za-z0-9_-]+$/)
    }
  })

  test('an already-legal name keeps its spelling against a colliding rewrite', () => {
    registerTool('a_b')
    registerTool('a:b')
    assert.equal(mcpWireName('tool', 'a_b'), 'a_b')
    assert.notEqual(mcpWireName('tool', 'a:b'), 'a_b')
  })

  test('every registered name is reachable under the name it is advertised as', () => {
    const names = ['a:b', 'a.b', 'a_b', 'a b', 'plain']
    for (const n of names) {
      registerTool(n)
    }
    for (const n of names) {
      assert.equal(mcpResolveWireName('tool', mcpWireName('tool', n)), n)
    }
  })

  test('assignment does not depend on registration order', () => {
    registerTool('a:b')
    registerTool('a.b')
    const first = ['a:b', 'a.b'].map((n) => mcpWireName('tool', n))

    resetPikkuState()
    registerTool('a.b')
    registerTool('a:b')
    const second = ['a:b', 'a.b'].map((n) => mcpWireName('tool', n))

    assert.deepEqual(first, second)
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
    // A tool registered under the wire spelling must win, or a client asking
    // for the one it can see would be handed the other.
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
 * See `the-mcp-handshake-is-challenged-only-when-every-target-is-gated.md`.
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
