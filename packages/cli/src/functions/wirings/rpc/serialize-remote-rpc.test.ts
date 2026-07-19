import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeRemoteRPC } from './serialize-remote-rpc.js'

describe('serializeRemoteRPC', () => {
  test('generates the remote RPC handler with an HTTP endpoint', () => {
    const output = serializeRemoteRPC('./pikku-types.gen.js')
    assert.ok(output.includes('remoteRPCHandler'))
    assert.ok(output.includes('wireHTTP'))
    assert.ok(output.includes('/remote/rpc/:rpcName'))
    assert.ok(output.includes('remote: true'))
  })

  test('wires the pikku-remote-internal-rpc queue worker consumed by scheduleRPC', () => {
    const output = serializeRemoteRPC('./pikku-types.gen.js')
    assert.ok(
      output.includes('wireQueueWorker'),
      'expected wireQueueWorker to be imported and called'
    )
    assert.ok(
      output.includes("name: 'pikku-remote-internal-rpc'"),
      'expected a queue worker for the pikku-remote-internal-rpc queue'
    )
    assert.ok(
      /wireQueueWorker\(\{[\s\S]*?func: remoteRPCHandler/.test(output),
      'expected the queue worker to invoke remoteRPCHandler'
    )
  })

  test('mesh mode (default) gates the endpoint with pikkuRemoteAuthMiddleware', () => {
    const output = serializeRemoteRPC('./pikku-types.gen.js')
    assert.ok(output.includes('pikkuRemoteAuthMiddleware'))
    assert.ok(output.includes('middleware: [pikkuRemoteAuthMiddleware]'))
    assert.ok(!output.includes('assertRemoteInvocable'))
  })

  test('no-auth (public) mode drops the mesh secret and guards to remote: true funcs', () => {
    const output = serializeRemoteRPC('./pikku-types.gen.js', { noAuth: true })
    assert.ok(
      !output.includes('pikkuRemoteAuthMiddleware'),
      'public surface must not require the mesh secret'
    )
    assert.ok(
      output.includes('assertRemoteInvocable'),
      'public surface must guard to remote: true functions'
    )
    assert.ok(output.includes('/remote/rpc/:rpcName'))
    assert.ok(output.includes('auth: false'))
  })
})
