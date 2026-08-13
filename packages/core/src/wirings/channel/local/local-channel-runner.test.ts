import { test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { runLocalChannel } from './local-channel-runner.js'
import { pikkuState, resetPikkuState } from '../../../pikku-state.js'
import { wireChannel } from '../channel-runner.js'
import { addFunction } from '../../../function/function-runner.js'
import { addHTTPMiddleware } from '../../http/http-runner.js'
import type {
  HTTPMethod,
  PikkuHTTPRequest,
  PikkuHTTPResponse,
  PikkuQuery,
} from '../../http/http.types.js'
import type { SerializeOptions } from 'cookie'
import { httpRouter } from '../../http/routers/http-router.js'
import { pikkuMiddleware } from '../../../types/core.types.js'

const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
}

const mockSingletonServices = {
  logger: mockLogger,
} as any

export class PikkuMockRequest implements PikkuHTTPRequest {
  private _params: Record<string, string | string[] | undefined> = {}

  constructor(
    private _route: string,
    private _method: HTTPMethod
  ) {}

  method(): HTTPMethod {
    return this._method
  }
  path(): string {
    return this._route
  }
  json(): Promise<unknown> {
    throw new Error('Method not implemented.')
  }
  arrayBuffer(): Promise<ArrayBuffer> {
    throw new Error('Method not implemented.')
  }
  header(headerName: string): string | null {
    throw new Error('Method not implemented.')
  }
  cookie(name?: string): string | null {
    throw new Error('Method not implemented.')
  }
  params(): Partial<Record<string, string | string[]>> {
    return this._params
  }
  setParams(params: Record<string, string | string[] | undefined>): void {
    this._params = params
  }
  query(): PikkuQuery {
    throw new Error('Method not implemented.')
  }
  public async data() {
    return { test: 'data' }
  }
}

export class PikkuMockResponse implements PikkuHTTPResponse {
  public _status: number = 200

  public get statusCode(): number {
    return this._status
  }

  status(code: number): this {
    this._status = code
    return this
  }

  cookie(name: string, value: string | null, options: SerializeOptions): this {
    throw new Error('Method not implemented.')
  }
  header(name: string, value: string | string[]): this {
    throw new Error('Method not implemented.')
  }
  arrayBuffer(data: XMLHttpRequestBodyInit): this {
    throw new Error('Method not implemented.')
  }
  json(data: unknown): this {
    return this
  }
  redirect(location: string, status?: number): this {
    throw new Error('Method not implemented.')
  }
}

const mockCreateWireServices = async () => ({
  wireServiceMock: true,
})

beforeEach(() => {
  resetPikkuState()
  httpRouter.reset()
  pikkuState(null, 'package', 'singletonServices', mockSingletonServices as any)
  pikkuState(null, 'package', 'factories', {
    createWireServices: mockCreateWireServices,
  } as any)
})

afterEach(() => {
  resetPikkuState()
  httpRouter.reset()
})

test('runChannel should return undefined and 404 if no matching channel is found', async () => {
  const mockResponse = new PikkuMockResponse()

  const result = await runLocalChannel({
    channelId: 'test-channel-id',
    request: new PikkuMockRequest('/non-existent-channel', 'get'),
    response: mockResponse,
  })

  assert.equal(
    result,
    undefined,
    'Should return undefined if no channel matches'
  )
  assert.equal(mockResponse._status, 404, 'Should set response status to 404')
})

test('runChannel should return a channel handler if channel matches and no auth required', async () => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', mockSingletonServices as any)
  pikkuState(null, 'package', 'factories', {
    createWireServices: mockCreateWireServices,
  } as any)

  pikkuState(null, 'channel', 'meta', {
    test: {
      name: 'test',
      route: '/test-channel',
    },
  } as any)
  wireChannel({
    name: 'test',
    route: '/test-channel',
    auth: false,
  })

  httpRouter.initialize()

  const result = await runLocalChannel({
    channelId: 'test-channel-id',
    request: new PikkuMockRequest('/test-channel', 'get'),
    response: new PikkuMockResponse(),
    route: '/test-channel',
  })

  assert.ok(result, 'Should return a PikkuChannelHandler instance')

  result.open()
})

test('runChannel should close wire services once when channel closes', async () => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', mockSingletonServices as any)
  let closeCount = 0

  pikkuState(null, 'channel', 'meta', {
    test: {
      name: 'test',
      route: '/test-channel',
    },
  } as any)
  wireChannel({
    name: 'test',
    route: '/test-channel',
    auth: false,
  })

  httpRouter.initialize()

  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({
      tracked: {
        close: async () => {
          closeCount += 1
        },
      },
    }),
  } as any)

  const result = await runLocalChannel({
    channelId: 'test-channel-id',
    request: new PikkuMockRequest('/test-channel', 'get'),
    response: new PikkuMockResponse(),
    route: '/test-channel',
  })

  assert.ok(result)
  assert.equal(closeCount, 0)

  result.close()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(closeCount, 1)

  result.close()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(closeCount, 1)
})

test('runChannel should run HTTP middleware on websocket upgrade and establish session', async () => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', mockSingletonServices as any)
  pikkuState(null, 'package', 'factories', {
    createWireServices: mockCreateWireServices,
  } as any)

  addHTTPMiddleware(
    '*',
    [
      pikkuMiddleware(async (_services, { setSession }, next) => {
        setSession?.({ userId: 'user-1' } as any)
        await next()
      }),
    ],
    null
  )

  pikkuState(null, 'channel', 'meta', {
    test: {
      name: 'test',
      route: '/test-channel',
      messageWirings: {
        action: {
          ping: {
            pikkuFuncId: 'test:ping',
          },
        },
      },
    },
  } as any)
  wireChannel({
    name: 'test',
    route: '/test-channel',
    onMessageWiring: {
      action: {
        ping: {
          func: async (_services, data) => data,
        },
      },
    },
  } as any)

  httpRouter.initialize()

  const result = await runLocalChannel({
    channelId: 'test-channel-id',
    request: new PikkuMockRequest('/test-channel', 'get'),
    response: new PikkuMockResponse(),
    route: '/test-channel',
  })

  assert.ok(result)
  let sent: unknown
  result.registerOnSend((message) => {
    sent = message
  })
  await result.message(JSON.stringify({ action: 'ping' }))
  assert.deepEqual(sent, { action: 'ping' })
})

test('a message handler that returns nothing does not attempt to send', async () => {
  // The connect path already guards this; the message path did not, so a handler
  // with nothing to say produced `send requires a non-empty message` on every
  // message. Gateway websockets hit it every time — their generated message
  // handler returns undefined by design — which is why a chat gateway could
  // accept a connection and never deliver anything to its handler.
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', mockSingletonServices as any)
  pikkuState(null, 'package', 'factories', {
    createWireServices: mockCreateWireServices,
  } as any)

  const sent: unknown[] = []
  let handled = 0

  pikkuState(null, 'channel', 'meta', {
    quiet: {
      name: 'quiet',
      route: '/quiet-channel',
      message: { pikkuFuncId: 'quietMessage' },
      messageWirings: {},
    },
  } as any)
  pikkuState(null, 'function', 'meta')['quietMessage'] = {
    pikkuFuncId: 'quietMessage',
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  } as any
  const quietMessage = {
    auth: false,
    func: async () => {
      handled++
      return undefined
    },
  }
  wireChannel({
    name: 'quiet',
    route: '/quiet-channel',
    auth: false,
    onMessage: quietMessage as any,
  } as any)

  httpRouter.initialize()

  const handler = await runLocalChannel({
    channelId: 'quiet-channel-id',
    request: new PikkuMockRequest('/quiet-channel', 'get'),
    response: new PikkuMockResponse(),
    route: '/quiet-channel',
  })
  assert.ok(handler)
  handler.registerOnSend(async (message: unknown) => {
    sent.push(message)
  })
  handler.open()

  await handler.message(JSON.stringify({ text: 'hello' }))

  assert.equal(handled, 1, 'the handler should have run')
  assert.deepEqual(
    sent,
    [],
    'nothing should have been sent for an empty result'
  )
})
