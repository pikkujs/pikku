import { test, describe, beforeEach } from 'node:test'
import * as assert from 'assert'
import { ForbiddenError } from '../../errors/errors.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'
import { PikkuSessionService } from '../../services/user-session-service.js'
import { processMessageHandlers } from './channel-handler.js'
import {
  createEventHubDistributor,
  createLocalDeliveryBackend,
  setEventHubDistributor,
} from './event-hub/index.js'
import type { PikkuChannelHandler } from './channel.types.js'

const logger = { info() {}, warn() {}, error() {}, debug() {} }

let counter = 0

describe('a subscribe function wired as a channel message action', () => {
  let distributor: ReturnType<typeof createEventHubDistributor>
  const sent: unknown[] = []
  const channelId = 'ch-1'
  let channelName = ''

  const channelHandler = (): PikkuChannelHandler =>
    ({
      getChannel: () => ({ channelId, send: (d: unknown) => sent.push(d) }),
      send: (d: unknown) => {
        sent.push(d)
      },
      sendBinary: () => {},
    }) as any

  const setup = ({
    scopes = ['board:read'],
    permissions,
    topic = 'board:acme',
    attached = true,
    sessionScopes = ['board:read'],
    session = true,
  }: {
    scopes?: string[]
    permissions?: Record<string, any>
    topic?: string
    attached?: boolean
    sessionScopes?: string[]
    session?: boolean
  } = {}) => {
    channelName = `live${++counter}`
    const funcId = `subscribeToBoard${counter}`
    pikkuState(null, 'function', 'meta', {
      [funcId]: {
        pikkuFuncId: funcId,
        inputSchemaName: null,
        outputSchemaName: null,
        sessionless: false,
        scopes,
        subscribe: { topicPattern: 'board:${string}' },
      },
    } as any)
    addFunction(funcId, {
      func: async () => topic,
      scopes,
      permissions,
    } as any)
    pikkuState(null, 'channel', 'meta', {
      [channelName]: {
        name: channelName,
        route: '/live',
        messageWirings: {
          action: { subscribeToBoard: { pikkuFuncId: funcId } },
        },
      },
    } as any)
    const handler = channelHandler()
    if (attached) {
      distributor.attach(handler, distributor.deliveryFor('local')!, {})
    }
    const userSession = new PikkuSessionService<any>()
    if (session) userSession.setInitial({ userId: 'u1', scopes: sessionScopes })
    const { onMessage } = processMessageHandlers(
      { logger } as any,
      {
        name: channelName,
        route: '/live',
        onMessageWiring: {
          action: { subscribeToBoard: { func: async () => topic } },
        },
      } as any,
      handler,
      userSession as any
    )
    return { onMessage, funcId }
  }

  beforeEach(() => {
    resetPikkuState()
    sent.length = 0
    distributor = createEventHubDistributor({
      topics: () => ['board:${string}'],
    })
    distributor.registerDelivery(createLocalDeliveryBackend())
    setEventHubDistributor(distributor)
  })

  test('subscribes the channel to the returned topic without echoing it', async () => {
    const { onMessage, funcId } = setup()
    const reply = await onMessage(
      JSON.stringify({ action: 'subscribeToBoard', id: 'x' })
    )
    assert.deepStrictEqual(reply, { action: 'subscribeToBoard' })
    assert.strictEqual(distributor.subscriptionCount(), 1)
    const [sub] = distributor.subscriptions()
    assert.strictEqual(sub.topic, 'board:acme')
    assert.strictEqual(sub.pikkuFuncId, funcId)
    assert.strictEqual(sub.wireType, 'channel')
    assert.ok(!JSON.stringify(reply).includes('board:acme'))
    await distributor.publish('board:acme', { moved: 1 })
    assert.deepStrictEqual(sent, ['{"moved":1}'])
  })

  test('is refused without the scope and subscribes nothing', async () => {
    const { onMessage } = setup({ sessionScopes: [] })
    await assert.rejects(
      () => onMessage(JSON.stringify({ action: 'subscribeToBoard' })),
      /Missing required scope/
    )
    assert.strictEqual(distributor.subscriptionCount(), 0)
  })

  test('is refused when a permission throws', async () => {
    const { onMessage } = setup({
      permissions: {
        member: async () => {
          throw new ForbiddenError('not a member')
        },
      },
    })
    await assert.rejects(
      () => onMessage(JSON.stringify({ action: 'subscribeToBoard' })),
      ForbiddenError
    )
    assert.strictEqual(distributor.subscriptionCount(), 0)
  })

  test('a channel the runtime never attached cannot subscribe', async () => {
    const { onMessage } = setup({ attached: false })
    await assert.rejects(
      () => onMessage(JSON.stringify({ action: 'subscribeToBoard' })),
      /not attached/
    )
  })

  test('a topic no subscribe function declares is refused', async () => {
    const { onMessage } = setup({ topic: 'invoice:1' })
    await assert.rejects(
      () => onMessage(JSON.stringify({ action: 'subscribeToBoard' })),
      /declared/
    )
    assert.strictEqual(distributor.subscriptionCount(), 0)
  })
})
