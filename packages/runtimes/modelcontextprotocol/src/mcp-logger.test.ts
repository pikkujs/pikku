import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'

import { PikkuMCPServer } from './index.js'

/**
 * `createMCPLogger` outlives no server instance of its own.
 *
 * Under stdio the SDK builds the server from the factory when the client
 * connects, and `start.ts` swaps the app's logger for this one immediately
 * after `connectStdio()` returns — before that ever happens. A logger that
 * captured the instance therefore captured `undefined`, and the first tool that
 * logged threw a `TypeError` the tool handler reported as a bare
 * `-32603 Internal error` with no data.
 */
const fallback = {
  debug: () => {},
  info: (message: unknown) => {
    fallbackMessages.push(message)
  },
  warn: () => {},
  error: () => {},
}

let fallbackMessages: unknown[] = []

const buildServer = async () => {
  const server = new PikkuMCPServer(
    {
      name: 'test',
      version: '1.0.0',
      mcpJSON: { tools: [], resources: [], prompts: [] },
      capabilities: { logging: {}, tools: {} },
    } as never,
    fallback as never
  )
  await server.init()
  return server
}

describe('createMCPLogger resolves the server per message', () => {
  beforeEach(() => {
    resetPikkuState()
    fallbackMessages = []
    pikkuState(null, 'package', 'singletonServices', {
      logger: fallback,
    } as never)
  })

  test('logging before a client connects does not throw', async () => {
    const server = await buildServer()

    const logger = server.createMCPLogger()

    assert.doesNotThrow(() => logger.info('todo created'))
    assert.deepEqual(
      fallbackMessages,
      ['todo created'],
      'a message with nowhere to go belongs in the logger the server was built with'
    )
  })

  test('once a client connects the message goes to it', async () => {
    const server = await buildServer()
    const logger = server.createMCPLogger()

    const sent: unknown[] = []
    ;(server as any).server = {
      sendLoggingMessage: (message: unknown) => sent.push(message),
    }

    logger.info('todo created')

    assert.deepEqual(sent, [{ level: 'info', data: 'todo created' }])
    assert.deepEqual(
      fallbackMessages,
      [],
      'the connected client is the destination, not a second copy'
    )
  })
})
