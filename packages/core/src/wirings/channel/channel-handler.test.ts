import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { addFunction } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { processMessageHandlers } from './channel-handler.js'

const createLogger = () => {
  const errors: string[] = []
  return {
    errors,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (...args: unknown[]) => {
        errors.push(args.map((arg) => String(arg)).join(' '))
      },
    },
  }
}

const createChannelHandler = () => {
  const sent: unknown[] = []
  const channel = {
    channelId: 'channel-1',
    openingData: {},
    state: 'open' as const,
    send: (message: unknown) => {
      sent.push(message)
    },
    sendBinary: () => {},
    close: () => {},
    setState: () => {},
    getState: () => undefined,
    clearState: () => {},
  }

  return {
    sent,
    handler: {
      send: (message: unknown) => channel.send(message),
      sendBinary: () => {},
      getChannel: () => channel,
    },
  }
}

const registerFunction = (
  funcName: string,
  func: (services: any, data: any, wire: any) => Promise<unknown> | unknown
) => {
  addFunction(funcName, { func } as never)
  pikkuState(null, 'function', 'meta')[funcName] = {
    name: funcName,
    sessionless: true,
    permissions: [],
  } as never
}

beforeEach(() => {
  resetPikkuState()
})

describe('processMessageHandlers', () => {
  test('routes json messages using onMessageWiring and appends the routing key to the result', async () => {
    const { logger } = createLogger()
    const { handler } = createChannelHandler()

    pikkuState(null, 'channel', 'meta').chat = {
      name: 'chat',
      route: '/chat',
      input: null,
      connect: null,
      disconnect: null,
      message: null,
      messageWirings: {
        kind: {
          ping: {
            pikkuFuncId: 'pingFunc',
            packageName: null,
          },
        },
      },
    } as never
    registerFunction('pingFunc', async (_services, data) => ({
      reply: `pong:${data.value}`,
    }))

    const { onMessage } = processMessageHandlers(
      { logger } as never,
      {
        name: 'chat',
        route: '/chat',
        auth: false,
        onMessageWiring: {
          kind: {
            ping: {
              func: { func: async () => ({ ok: true }) } as never,
            },
          },
        },
      } as never,
      handler as never
    )

    const result = await onMessage('{"kind":"ping","value":"hello"}')

    assert.deepEqual(result, {
      reply: 'pong:hello',
      kind: 'ping',
    })
  })

  test('falls back to the default handler for parsed json with no matching route', async () => {
    const { logger } = createLogger()
    const { handler } = createChannelHandler()

    pikkuState(null, 'channel', 'meta').chat = {
      name: 'chat',
      route: '/chat',
      input: null,
      connect: null,
      disconnect: null,
      message: {
        pikkuFuncId: 'defaultFunc',
        packageName: null,
      },
      messageWirings: {
        kind: {
          ping: {
            pikkuFuncId: 'pingFunc',
            packageName: null,
          },
        },
      },
    } as never
    registerFunction('defaultFunc', async (_services, data) => ({
      seen: data,
    }))

    const { onMessage } = processMessageHandlers(
      { logger } as never,
      {
        name: 'chat',
        route: '/chat',
        auth: false,
        onMessage: { func: async () => ({ ok: true }) } as never,
        onMessageWiring: {
          kind: {
            ping: {
              func: { func: async () => ({ ok: true }) } as never,
            },
          },
        },
      } as never,
      handler as never
    )

    const result = await onMessage('{"kind":"unknown","value":"hello"}')

    assert.deepEqual(result, {
      seen: { kind: 'unknown', value: 'hello' },
    })
  })

  test('uses wrapper auth for default messages and sends unauthorized errors without a session', async () => {
    const { errors, logger } = createLogger()
    const { sent, handler } = createChannelHandler()

    pikkuState(null, 'channel', 'meta').chat = {
      name: 'chat',
      route: '/chat',
      input: null,
      connect: null,
      disconnect: null,
      message: {
        pikkuFuncId: 'defaultFunc',
        packageName: null,
      },
      messageWirings: {},
    } as never
    registerFunction('defaultFunc', async () => ({ ok: true }))

    const { onMessage } = processMessageHandlers(
      { logger } as never,
      {
        name: 'chat',
        route: '/chat',
        auth: false,
        onMessage: {
          auth: true,
          func: { func: async () => ({ ok: true }) } as never,
        },
      } as never,
      handler as never
    )

    const result = await onMessage('hello')

    assert.equal(result, undefined)
    assert.deepEqual(sent, ['Unauthorized for the default message route'])
    assert.match(
      errors[0] || '',
      /requires a session for the default message route/
    )
  })

  test('logs when no message handler can process the payload', async () => {
    const { errors, logger } = createLogger()
    const { handler } = createChannelHandler()

    pikkuState(null, 'channel', 'meta').chat = {
      name: 'chat',
      route: '/chat',
      input: null,
      connect: null,
      disconnect: null,
      message: null,
      messageWirings: {},
    } as never

    const { onMessage } = processMessageHandlers(
      { logger } as never,
      {
        name: 'chat',
        route: '/chat',
        auth: false,
      } as never,
      handler as never
    )

    const result = await onMessage({ raw: true })

    assert.equal(result, undefined)
    assert.match(
      errors[0] || '',
      /No handler found for message in channel chat/
    )
    assert.match(errors[1] || '', /Channel config name: chat/)
  })

  test('blocks binary messages when a session is required and missing', async () => {
    const { errors, logger } = createLogger()
    const { handler } = createChannelHandler()

    pikkuState(null, 'channel', 'meta').chat = {
      name: 'chat',
      route: '/chat',
      input: null,
      connect: null,
      disconnect: null,
      message: null,
      messageWirings: {},
    } as never

    const { onBinaryMessage } = processMessageHandlers(
      { logger } as never,
      {
        name: 'chat',
        route: '/chat',
        onBinaryMessage: async () => new Uint8Array([1, 2, 3]),
      } as never,
      handler as never
    )

    const result = await onBinaryMessage?.(new Uint8Array([1, 2, 3]))

    assert.equal(result, undefined)
    assert.match(errors[0] || '', /requires a session for binary message/)
  })
})
