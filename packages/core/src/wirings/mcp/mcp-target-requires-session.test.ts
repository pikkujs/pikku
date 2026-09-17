import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { mcpTargetRequiresSession } from './mcp-runner.js'

/**
 * What a transport can know about a call before dispatching it.
 *
 * The runner's refusal comes too late to become a `401` — the response has
 * already started — so the challenge is decided from the declarations instead.
 * This is the reading of them.
 */
const registerTool = (
  name: string,
  funcMeta: { sessionless: boolean; auth?: boolean }
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

describe('mcpTargetRequiresSession', () => {
  beforeEach(() => {
    resetPikkuState()
  })

  test('a pikkuFunc needs a session', () => {
    registerTool('checkout', { sessionless: false })
    assert.equal(mcpTargetRequiresSession('tool', 'checkout'), true)
  })

  test('a pikkuSessionlessFunc does not', () => {
    registerTool('search', { sessionless: true })
    assert.equal(mcpTargetRequiresSession('tool', 'search'), false)
  })

  test('a sessionless func declaring auth: true does', () => {
    registerTool('myOrders', { sessionless: true, auth: true })
    assert.equal(mcpTargetRequiresSession('tool', 'myOrders'), true)
  })

  test('a sessionless func declaring auth: false does not', () => {
    registerTool('ping', { sessionless: true, auth: false })
    assert.equal(mcpTargetRequiresSession('tool', 'ping'), false)
  })

  test('an unregistered target is open, so a client is not sent to authenticate for a tool that does not exist', () => {
    assert.equal(mcpTargetRequiresSession('tool', 'nope'), false)
  })

  test('a registered tool whose function is missing is open too', () => {
    pikkuState(null, 'mcp', 'toolsMeta').orphan = {
      name: 'orphan',
      title: 'orphan',
      description: 'orphan',
      pikkuFuncId: 'missingFunc',
      inputSchema: null,
      outputSchema: 'MCPToolResponse',
    } as never
    assert.equal(mcpTargetRequiresSession('tool', 'orphan'), false)
  })
})
