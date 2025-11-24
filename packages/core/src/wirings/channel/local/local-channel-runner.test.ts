import { test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { runLocalChannel } from './local-channel-runner.js'
import { pikkuState, resetPikkuState } from '../../../pikku-state.js'
import { wireChannel } from '../channel-runner.js'
import {
  HTTPMethod,
  PikkuHTTPRequest,
  PikkuHTTPResponse,
  PikkuQuery,
} from '../../http/http.types.js'
import { SerializeOptions } from 'cookie'
import { httpRouter } from '../../http/routers/http-router.js'

/**
 * Minimal stubs for dependencies that runChannel expects.
 * In a real test setup, you may provide more comprehensive mocks
 * or refactor your code to allow dependency injection.
 */
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
}

const mockSingletonServices = {
  logger: mockLogger,
} as any

// Mock request and response objects
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
  public _status: number | undefined

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
    // We don't need to implement this for our test
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
})

afterEach(() => {
  resetPikkuState()
})

test('runChannel should return undefined and 404 if no matching channel is found', async () => {
  const mockResponse = new PikkuMockResponse()

  const result = await runLocalChannel({
    singletonServices: mockSingletonServices,
    channelId: 'test-channel-id',
    request: new PikkuMockRequest('/non-existent-channel', 'get'),
    response: mockResponse,
    createWireServices: mockCreateWireServices,
  })

  assert.equal(
    result,
    undefined,
    'Should return undefined if no channel matches'
  )
  assert.equal(mockResponse._status, 404, 'Should set response status to 404')
  // assert.equal(mockResponse._ended, true, 'Should end the response')
})

test('runChannel should return a channel handler if channel matches and no auth required', async () => {
  resetPikkuState()

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

  // Initialize router after adding channel (for tests)
  httpRouter.initialize()

  const result = await runLocalChannel({
    singletonServices: mockSingletonServices,
    channelId: 'test-channel-id',
    request: new PikkuMockRequest('/test-channel', 'get'),
    response: new PikkuMockResponse(),
    route: '/test-channel',
    createWireServices: mockCreateWireServices,
  })

  assert.ok(result, 'Should return a PikkuChannelHandler instance')

  // Simulate opening the channel
  result.open()

  // TODO: Test that the opened channel works
})
