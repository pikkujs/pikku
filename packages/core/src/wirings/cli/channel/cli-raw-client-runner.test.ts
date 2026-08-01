import { describe, test } from 'node:test'
import * as assert from 'node:assert/strict'

import { executeRawCLIViaChannel } from './cli-raw-client-runner.js'
import {
  CHANNEL_RPC_REQUEST,
  CHANNEL_RPC_RESPONSE,
} from '../../channel/channel-rpc.js'

/**
 * The client half of the transport, stubbed at the surface
 * `executeRawCLIViaChannel` actually uses: a route to send on, a subscription
 * for incoming frames, and the socket's own open/close/error events.
 */
const fakeWS = ({ readyState = 1 }: { readyState?: number } = {}) => {
  const sent: Array<{ method: string; data: unknown }> = []
  const rawSent: unknown[] = []
  const subscribers = new Set<(message: any) => void>()
  const listeners = new Map<string, Array<(event: any) => void>>()
  let closed = false

  const pikkuWS = {
    getRoute: () => ({
      send: (method: string, data: unknown) => {
        sent.push({ method, data })
      },
    }),
    subscribe: (handler: (message: any) => void) => subscribers.add(handler),
    unsubscribe: (handler: (message: any) => void) =>
      subscribers.delete(handler),
    ws: {
      readyState,
      // Reverse-RPC answers go straight out on the socket rather than on a
      // command route — the server takes them off before routing.
      send: (data: string) => {
        rawSent.push(JSON.parse(data))
      },
      close: () => {
        closed = true
      },
      addEventListener: (event: string, listener: (event: any) => void) => {
        const existing = listeners.get(event) ?? []
        existing.push(listener)
        listeners.set(event, existing)
      },
    },
  }

  return {
    pikkuWS,
    sent,
    rawSent,
    isClosed: () => closed,
    /** Delivers a frame the way the runtime's message dispatch would. */
    receive: (message: unknown) => {
      // Copied first: a handler unsubscribes itself when the command completes.
      const current = Array.from(subscribers)
      for (const subscriber of current) {
        subscriber(message)
      }
    },
    emit: (event: string, payload?: unknown) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(payload)
      }
    },
  }
}

/** Captures what the runner would have written to the terminal. */
const captureConsole = () => {
  const out: string[] = []
  const err: string[] = []
  const log = console.log
  const error = console.error
  console.log = (...args: unknown[]) => out.push(args.join(' '))
  console.error = (...args: unknown[]) => err.push(args.join(' '))
  return {
    out,
    err,
    restore: () => {
      console.log = log
      console.error = error
    },
  }
}

describe('executeRawCLIViaChannel', () => {
  test('forwards argv untouched — the client never parses it', async () => {
    const ws = fakeWS()
    const console = captureConsole()

    const run = executeRawCLIViaChannel({
      pikkuWS: ws.pikkuWS,
      args: ['deploy', '--stage', 'prod', '--force'],
    })
    ws.receive({ action: 'cli-control', event: 'complete', exitCode: 0 })
    await run
    console.restore()

    assert.deepEqual(ws.sent, [
      {
        method: '__raw',
        data: { args: ['deploy', '--stage', 'prod', '--force'] },
      },
    ])
  })

  test('waits for the socket to open before sending', async () => {
    const ws = fakeWS({ readyState: 0 })
    const console = captureConsole()

    const run = executeRawCLIViaChannel({ pikkuWS: ws.pikkuWS, args: ['ping'] })
    assert.deepEqual(
      ws.sent,
      [],
      'nothing may be written before the open event'
    )

    ws.emit('open')
    assert.equal(ws.sent.length, 1)

    ws.receive({ action: 'cli-control', event: 'complete', exitCode: 0 })
    await run
    console.restore()
  })

  test('renders output with the renderer for the command the server reports', async () => {
    const ws = fakeWS()
    const console = captureConsole()
    const rendered: unknown[] = []

    const run = executeRawCLIViaChannel({
      pikkuWS: ws.pikkuWS,
      args: ['deploy'],
      renderers: {
        deploy: (_services, data) => rendered.push(data),
      },
    })
    ws.receive({
      action: 'cli-output',
      commandId: 'deploy',
      data: { phase: 'building' },
    })
    ws.receive({
      action: 'cli-result',
      commandId: 'deploy',
      result: { url: 'https://example.com' },
    })
    ws.receive({ action: 'cli-control', event: 'complete', exitCode: 0 })
    await run
    console.restore()

    assert.deepEqual(rendered, [
      { phase: 'building' },
      { url: 'https://example.com' },
    ])
    assert.deepEqual(console.out, [], 'a matched renderer owns the output')
  })

  test('falls back to JSON for a command the client does not know', async () => {
    const ws = fakeWS()
    const console = captureConsole()

    // The normal case once the server owns the command tree: a client built
    // before this command existed must still print something usable.
    const run = executeRawCLIViaChannel({
      pikkuWS: ws.pikkuWS,
      args: ['stage', 'describe'],
      renderers: { deploy: () => assert.fail('wrong renderer') },
    })
    ws.receive({
      action: 'cli-output',
      commandId: 'stage.describe',
      data: { name: 'prod' },
    })
    ws.receive({ action: 'cli-control', event: 'complete', exitCode: 0 })
    await run
    console.restore()

    assert.deepEqual(console.out, ['{"name":"prod"}'])
  })

  test('help goes to stdout and errors to stderr', async () => {
    const ws = fakeWS()
    const console = captureConsole()

    const run = executeRawCLIViaChannel({ pikkuWS: ws.pikkuWS, args: ['nope'] })
    ws.receive({ action: 'cli-help', help: 'Usage: release <command>' })
    ws.receive({ action: 'cli-error', error: 'Unknown command "nope"' })
    ws.receive({ action: 'cli-control', event: 'complete', exitCode: 1 })
    const exitCode = await run
    console.restore()

    assert.equal(exitCode, 1)
    assert.deepEqual(console.out, ['Usage: release <command>'])
    assert.deepEqual(console.err, ['Unknown command "nope"'])
  })

  test('answers a capability the server calls back for', async () => {
    const ws = fakeWS()
    const console = captureConsole()
    const rendered: unknown[] = []

    const run = executeRawCLIViaChannel({
      pikkuWS: ws.pikkuWS,
      args: ['deploy'],
      defaultRenderer: (_services, data) => rendered.push(data),
      capabilities: {
        localCheckout: () => ({ sha: 'deadbeef', branch: 'main' }),
      },
    })
    ws.receive({
      action: CHANNEL_RPC_REQUEST,
      id: '1',
      funcName: 'localCheckout',
      data: {},
    })

    // Answering is async, so let the responder settle before asserting.
    await new Promise((resolve) => setImmediate(resolve))

    assert.deepEqual(ws.rawSent[0], {
      action: CHANNEL_RPC_RESPONSE,
      id: '1',
      ok: true,
      result: { sha: 'deadbeef', branch: 'main' },
    })
    assert.equal(
      ws.sent.length,
      1,
      'the answer does not go out on a command route'
    )
    assert.deepEqual(rendered, [], 'an RPC request is not command output')

    ws.receive({ action: 'cli-control', event: 'complete', exitCode: 0 })
    await run
    console.restore()
  })

  test('refuses a capability outside the declared map', async () => {
    const ws = fakeWS()
    const console = captureConsole()

    const run = executeRawCLIViaChannel({
      pikkuWS: ws.pikkuWS,
      args: ['deploy'],
      capabilities: { localCheckout: () => ({}) },
    })
    ws.receive({
      action: CHANNEL_RPC_REQUEST,
      id: '1',
      funcName: 'readSSHKey',
      data: {},
    })
    await new Promise((resolve) => setImmediate(resolve))

    const response = ws.rawSent[0] as {
      ok: boolean
      error: { name: string }
    }
    assert.equal(response.ok, false)
    assert.equal(response.error.name, 'RPCNotFoundError')

    ws.receive({ action: 'cli-control', event: 'complete', exitCode: 0 })
    await run
    console.restore()
  })

  test('ignores frames that are not part of the CLI protocol', async () => {
    const ws = fakeWS()
    const console = captureConsole()

    const run = executeRawCLIViaChannel({
      pikkuWS: ws.pikkuWS,
      args: ['deploy'],
    })
    // The runtime's own routing echo, and anything else sharing the socket:
    // rendering these would print noise between a command's real output.
    ws.receive({ action: 'unrelated' })
    ws.receive('a bare string')
    ws.receive(null)
    ws.receive({ command: '__raw' })
    ws.receive({ action: 'cli-control', event: 'complete', exitCode: 0 })
    await run
    console.restore()

    assert.deepEqual(console.out, [])
    assert.deepEqual(console.err, [])
  })

  test('a socket that closes before completing is a failed run', async () => {
    const ws = fakeWS()
    const console = captureConsole()

    const run = executeRawCLIViaChannel({
      pikkuWS: ws.pikkuWS,
      args: ['deploy'],
    })
    // A rejected upgrade or a connection dropped mid-command: the command did
    // not finish, and reporting 0 would let a caller treat a connection
    // failure as a successful run.
    ws.emit('close')
    const exitCode = await run
    console.restore()

    assert.equal(exitCode, 1)
  })

  test('a transport error is reported like a failed command', async () => {
    const ws = fakeWS()
    const console = captureConsole()

    const run = executeRawCLIViaChannel({
      pikkuWS: ws.pikkuWS,
      args: ['deploy'],
    })
    ws.emit('error', { message: 'ECONNRESET' })
    const exitCode = await run
    console.restore()

    assert.equal(exitCode, 1)
    assert.deepEqual(console.err, ['ECONNRESET'])
  })

  test('a close after completing does not overwrite the exit code', async () => {
    const ws = fakeWS()
    const console = captureConsole()

    const run = executeRawCLIViaChannel({
      pikkuWS: ws.pikkuWS,
      args: ['deploy'],
    })
    ws.receive({ action: 'cli-control', event: 'complete', exitCode: 0 })
    // The runner closes the socket itself on completion, so this always
    // follows a successful run.
    ws.emit('close')
    const exitCode = await run
    console.restore()

    assert.equal(exitCode, 0)
    assert.equal(ws.isClosed(), true)
  })

  test('a complete with no exit code is a success', async () => {
    const ws = fakeWS()
    const console = captureConsole()

    const run = executeRawCLIViaChannel({
      pikkuWS: ws.pikkuWS,
      args: ['deploy'],
    })
    ws.receive({ action: 'cli-control', event: 'complete' })
    const exitCode = await run
    console.restore()

    assert.equal(exitCode, 0)
  })
})
