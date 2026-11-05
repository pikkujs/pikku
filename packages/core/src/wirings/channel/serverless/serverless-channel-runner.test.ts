import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { addFunction } from '../../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../../pikku-state.js'
import { formatTraceparent, type TraceContext } from '../../../trace.js'
import { httpRouter } from '../../http/routers/http-router.js'
import { wireChannel } from '../channel-runner.js'
import type { Channel } from '../channel-store.js'
import { ChannelStore } from '../channel-store.js'
import { PikkuAbstractChannelHandler } from '../pikku-abstract-channel-handler.js'
import {
  runChannelConnect,
  runChannelDisconnect,
  runChannelMessage,
} from './serverless-channel-runner.js'

class MemoryChannelStore extends ChannelStore {
  public channels = new Map<string, Channel>()
  addChannel(channel: Channel) {
    this.channels.set(channel.channelId, channel)
  }
  removeChannels(ids: string[]) {
    ids.forEach((id) => this.channels.delete(id))
  }
  setPikkuUserId() {}
  getChannel(id: string) {
    return this.channels.get(id)!
  }
  setState() {}
  getState() {
    return undefined
  }
  clearState() {}
}

class RecordingHandler extends PikkuAbstractChannelHandler {
  send() {}
  sendBinary() {}
}

const logger = { info() {}, warn() {}, error() {}, debug() {} }

describe('a serverless channel is one trace', () => {
  let store: MemoryChannelStore
  let handlers: RecordingHandler[]
  let lifecycle: Array<{ hook: string; traceId?: string; parent?: string }>

  const params = () => ({
    channelId: 'ch-1',
    channelStore: store,
    channelHandlerFactory: (id: string, name: string, opening: unknown) => {
      const handler = new RecordingHandler(id, name, opening)
      handlers.push(handler)
      return handler
    },
  })

  const hook = (name: string) => ({
    auth: false,
    func: async (_services: unknown, _data: unknown, wire: any) => {
      lifecycle.push({
        hook: name,
        traceId: wire.traceId,
        parent: wire.trace?.parentSpanId,
      })
    },
  })

  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()
    store = new MemoryChannelStore()
    handlers = []
    lifecycle = []
    pikkuState(null, 'package', 'singletonServices', { logger } as any)
    for (const name of ['connect', 'disconnect']) {
      pikkuState(null, 'function', 'meta')[name] = {
        pikkuFuncId: name,
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: true,
      } as any
      addFunction(name, hook(name) as any)
    }
    pikkuState(null, 'channel', 'meta', {
      test: {
        name: 'test',
        route: '/test-channel',
        connect: { pikkuFuncId: 'connect' },
        disconnect: { pikkuFuncId: 'disconnect' },
      },
    } as any)
    wireChannel({
      name: 'test',
      route: '/test-channel',
      auth: false,
      onConnect: hook('connect'),
      onDisconnect: hook('disconnect'),
    } as any)
    httpRouter.initialize()
  })

  const connect = () =>
    runChannelConnect({
      ...params(),
      route: '/test-channel',
      bubbleErrors: true,
    } as any)

  test('connect stores the trace it opened', async () => {
    await connect()
    assert.equal(
      store.channels.get('ch-1')?.traceparent,
      formatTraceparent(handlers[0]!.trace as TraceContext)
    )
  })

  test('every frame is back on the connection span', async () => {
    await connect()
    const opened = handlers[0]!.trace!

    await runChannelMessage(params(), 'one')
    await runChannelMessage(params(), 'two')

    assert.equal(handlers.length, 3)
    for (const frame of handlers.slice(1)) {
      assert.equal(frame.trace?.traceId, opened.traceId)
      assert.equal(frame.trace?.spanId, opened.spanId)
      assert.equal(frame.trace?.sampled, opened.sampled)
    }
  })

  test('the lifecycle hooks are spans of the connection', async () => {
    await connect()
    const opened = handlers[0]!.trace!

    await runChannelDisconnect(params())

    assert.deepEqual(
      lifecycle.map(({ hook }) => hook),
      ['connect', 'disconnect']
    )
    for (const span of lifecycle) {
      assert.equal(span.traceId, opened.traceId)
      assert.equal(span.parent, opened.spanId)
    }
  })

  test('a channel stored without a trace gets a new one per frame', async () => {
    store.channels.set('ch-1', { channelId: 'ch-1', channelName: 'test' })

    await runChannelMessage(params(), 'one')
    await runChannelMessage(params(), 'two')

    assert.match(handlers[0]!.trace!.traceId, /^[0-9a-f]{32}$/)
    assert.notEqual(handlers[0]!.trace!.traceId, handlers[1]!.trace!.traceId)
  })

  test('a corrupt stored trace is not continued', async () => {
    store.channels.set('ch-1', {
      channelId: 'ch-1',
      channelName: 'test',
      traceparent: 'not-a-traceparent',
    })

    await runChannelMessage(params(), 'one')

    assert.match(handlers[0]!.trace!.traceId, /^[0-9a-f]{32}$/)
  })
})
