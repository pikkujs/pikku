import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { PikkuMCPServer } from './index.js'

describe('@pikku/modelcontextprotocol', () => {
  test('exports the MCP runtime API', () => {
    assert.equal(typeof PikkuMCPServer, 'function')
  })
})
