import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  addChannelMiddleware,
  clearChannelMiddlewareCache,
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from './channel-middleware-runner.js'

beforeEach(() => {
  resetPikkuState()
  clearChannelMiddlewareCache()
})

describe('addChannelMiddleware', () => {
  test('registers tag-scoped channel middleware for a package', () => {
    const middleware = [async () => {}]

    const result = addChannelMiddleware(
      'chat:outbound',
      middleware,
      '@addon/pkg'
    )

    assert.strictEqual(result, middleware)
    assert.strictEqual(
      pikkuState('@addon/pkg', 'channelMiddleware', 'tagGroup')[
        'chat:outbound'
      ],
      middleware
    )
  })
})

describe('combineChannelMiddleware', () => {
  test('combines tag, named wire middleware, and inline channel middleware', () => {
    const execution: string[] = []
    const tagMiddleware = async () => {
      execution.push('tag')
    }
    const namedMiddleware = async () => {
      execution.push('named')
    }
    const inlineMiddleware = async () => {
      execution.push('inline')
    }

    addChannelMiddleware('chat:outbound', [tagMiddleware], '@addon/pkg')
    pikkuState(null, 'misc', 'channelMiddleware').named = [
      namedMiddleware,
    ] as never

    const combined = combineChannelMiddleware('channel', 'combined-1', {
      packageName: '@addon/pkg',
      wireInheritedChannelMiddleware: [
        { type: 'tag', tag: 'chat:outbound' },
        { type: 'wire', name: 'named' },
      ],
      wireChannelMiddleware: [inlineMiddleware],
    })

    assert.deepEqual(combined, [
      tagMiddleware,
      namedMiddleware,
      inlineMiddleware,
    ])
    void execution
  })

  test('deduplicates middleware and returns cached results until the cache is cleared', () => {
    const shared = async () => {}
    addChannelMiddleware('chat:outbound', [shared])

    const first = combineChannelMiddleware('channel', 'cached-1', {
      wireInheritedChannelMiddleware: [{ type: 'tag', tag: 'chat:outbound' }],
      wireChannelMiddleware: [shared],
    })

    assert.deepEqual(first, [shared])

    addChannelMiddleware('chat:outbound', [async () => {}])

    const cached = combineChannelMiddleware('channel', 'cached-1', {
      wireInheritedChannelMiddleware: [{ type: 'tag', tag: 'chat:outbound' }],
    })
    assert.strictEqual(cached, first)

    clearChannelMiddlewareCache()

    const refreshed = combineChannelMiddleware('channel', 'cached-1', {
      wireInheritedChannelMiddleware: [{ type: 'tag', tag: 'chat:outbound' }],
    })
    assert.notStrictEqual(refreshed, first)
    assert.equal(refreshed.length, 1)
    assert.notStrictEqual(refreshed[0], shared)
  })

  test('ignores missing named middleware references', () => {
    const combined = combineChannelMiddleware('channel', 'missing-wire', {
      wireInheritedChannelMiddleware: [{ type: 'wire', name: 'missing' }],
    })

    assert.deepEqual(combined, [])
  })
})

describe('wrapChannelWithMiddleware', () => {
  test('returns the original wire when there is no channel or middleware', () => {
    const wireWithoutChannel = { traceId: 'trace-1' }
    const wireWithChannel = {
      channel: {
        send: async () => {},
        sendBinary: async () => {},
      },
    }

    assert.strictEqual(
      wrapChannelWithMiddleware(wireWithoutChannel as never, {} as never, [
        async () => {},
      ]),
      wireWithoutChannel
    )
    assert.strictEqual(
      wrapChannelWithMiddleware(wireWithChannel as never, {} as never, []),
      wireWithChannel
    )
  })

  test('wraps outbound channel sends and supports transformed arrays and null drops', async () => {
    const sent: string[] = []
    const wrapped = wrapChannelWithMiddleware(
      {
        channel: {
          send: async (data: string) => {
            sent.push(data)
          },
          sendBinary: async () => {},
        },
      } as never,
      {} as never,
      [
        async (_services, event: string, next) => {
          if (event === 'drop') {
            await next(null)
            return
          }
          await next([`${event}:a`, `${event}:b`])
        },
        async (_services, event: string, next) => {
          await next(event.toUpperCase())
        },
      ]
    )

    await wrapped.channel!.send('hello')
    await wrapped.channel!.send('drop')

    assert.deepEqual(sent, ['HELLO:A', 'HELLO:B'])
    assert.strictEqual(wrapped.channel!.sendBinary, wrapped.channel!.sendBinary)
  })
})
