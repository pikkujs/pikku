import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { formatChannelRoute, parseChannelRoute } from './channel-selection.js'

describe('channel routes in the fragment', () => {
  test('a channel on its own', () => {
    assert.deepEqual(parseChannelRoute('chat'), {
      channelName: 'chat',
      selected: null,
    })
    assert.equal(
      formatChannelRoute({ channelName: 'chat', selected: null }),
      'chat'
    )
  })

  test('a handler inside a channel', () => {
    const route = parseChannelRoute('chat/connect')
    assert.deepEqual(route, {
      channelName: 'chat',
      selected: { type: 'handler', handler: 'connect' },
    })
    assert.equal(formatChannelRoute(route!), 'chat/connect')
  })

  test('an action inside a channel', () => {
    const route = parseChannelRoute('chat/messages/send')
    assert.deepEqual(route, {
      channelName: 'chat',
      selected: { type: 'action', category: 'messages', action: 'send' },
    })
    assert.equal(formatChannelRoute(route!), 'chat/messages/send')
  })

  test('a link from another page arrives type-qualified', () => {
    assert.deepEqual(parseChannelRoute('channel:chat/connect'), {
      channelName: 'chat',
      selected: { type: 'handler', handler: 'connect' },
    })
  })

  test('a fragment belonging to another list is not a channel route', () => {
    assert.equal(parseChannelRoute('function:getUser'), null)
    assert.equal(parseChannelRoute(''), null)
  })
})
