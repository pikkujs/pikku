import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeMeshRPC } from './serialize-mesh-rpc.js'

describe('serializeMeshRPC', () => {
  test('generates the remote RPC handler with an HTTP endpoint', () => {
    const { functions } = serializeMeshRPC(
      (name: string) => `./${name}/index.js`
    )
    assert.ok(functions.includes('meshRPCHandler'))
    assert.ok(functions.includes('wireHTTP'))
    assert.ok(functions.includes('/mesh/rpc/:rpcName'))
    assert.ok(functions.includes('remote: true'))
  })

  test('wires the pikku-mesh-rpc queue worker consumed by scheduleRPC', () => {
    const { functions } = serializeMeshRPC(
      (name: string) => `./${name}/index.js`
    )
    assert.ok(
      functions.includes('wireQueueWorker'),
      'expected wireQueueWorker to be imported and called'
    )
    assert.ok(
      functions.includes("name: 'pikku-mesh-rpc'"),
      'expected a queue worker for the pikku-mesh-rpc queue'
    )
    assert.ok(
      /wireQueueWorker\(\{[\s\S]*?func: meshRPCHandler/.test(functions),
      'expected the queue worker to invoke meshRPCHandler'
    )
  })

  test('describes the call with a zod schema from the sibling module', () => {
    const { schemas, functions } = serializeMeshRPC(
      (name: string) => `./${name}/index.js`
    )
    assert.ok(schemas.includes("import { z } from 'zod'"))
    assert.ok(schemas.includes('export const MeshRPCCall = z.object({'))
    assert.ok(functions.includes('input: MeshRPCCall'))
    assert.ok(functions.includes("from './rpc-mesh.schemas.gen.js'"))
    assert.ok(
      !functions.includes('pikkuSessionlessFunc<'),
      'schemas and generics are mutually exclusive'
    )
  })

  test('keeps the schemas module free of anything but zod', () => {
    const { schemas } = serializeMeshRPC((name: string) => `./${name}/index.js`)
    assert.ok(
      !schemas.includes('pikku-types.gen.js'),
      'the inspector imports this module directly, so it must not reach for a path deploy codegen rewrites'
    )
    assert.ok(!schemas.includes('@pikku/core'))
  })
})
