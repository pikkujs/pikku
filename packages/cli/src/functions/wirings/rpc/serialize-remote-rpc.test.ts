import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeRemoteRPC } from './serialize-remote-rpc.js'

describe('serializeRemoteRPC', () => {
  test('generates the remote RPC handler with an HTTP endpoint', () => {
    const { functions } = serializeRemoteRPC('./pikku-types.gen.js')
    assert.ok(functions.includes('remoteRPCHandler'))
    assert.ok(functions.includes('wireHTTP'))
    assert.ok(functions.includes('/remote/rpc/:rpcName'))
    assert.ok(functions.includes('remote: true'))
  })

  test('wires the pikku-remote-internal-rpc queue worker consumed by scheduleRPC', () => {
    const { functions } = serializeRemoteRPC('./pikku-types.gen.js')
    assert.ok(
      functions.includes('wireQueueWorker'),
      'expected wireQueueWorker to be imported and called'
    )
    assert.ok(
      functions.includes("name: 'pikku-remote-internal-rpc'"),
      'expected a queue worker for the pikku-remote-internal-rpc queue'
    )
    assert.ok(
      /wireQueueWorker\(\{[\s\S]*?func: remoteRPCHandler/.test(functions),
      'expected the queue worker to invoke remoteRPCHandler'
    )
  })

  test('describes the call with a zod schema from the sibling module', () => {
    const { schemas, functions } = serializeRemoteRPC('./pikku-types.gen.js')
    assert.ok(schemas.includes("import { z } from 'zod'"))
    assert.ok(schemas.includes('export const RemoteRPCCall = z.object({'))
    assert.ok(functions.includes('input: RemoteRPCCall'))
    assert.ok(functions.includes("from './rpc-remote.schemas.gen.js'"))
    assert.ok(
      !functions.includes('pikkuSessionlessFunc<'),
      'schemas and generics are mutually exclusive'
    )
  })

  test('keeps the schemas module free of anything but zod', () => {
    const { schemas } = serializeRemoteRPC('./pikku-types.gen.js')
    assert.ok(
      !schemas.includes('pikku-types.gen.js'),
      'the inspector imports this module directly, so it must not reach for a path deploy codegen rewrites'
    )
    assert.ok(!schemas.includes('@pikku/core'))
  })
})
