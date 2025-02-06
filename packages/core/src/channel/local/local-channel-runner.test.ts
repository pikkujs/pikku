import { test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { JSONValue } from '../../types/core.types.js'
import { PikkuHTTPAbstractRequest } from '../../http/pikku-http-abstract-request.js'
import { PikkuHTTPAbstractResponse } from '../../http/pikku-http-abstract-response.js'
import { runLocalChannel } from './local-channel-runner.js'

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
  // Provide a mock channelPermissionService only when needed
  // e.g., channelPermissionService: { verifyChannelAccess: async () => {} },
  httpSessionService: {},
} as any

// Mock request and response objects
class MockRequest extends PikkuHTTPAbstractRequest {
  public getBody(): Promise<unknown> {
    throw new Error('Method not implemented.')
  }
  public getHeader(headerName: string): string | undefined {
    throw new Error('Method not implemented.')
  }
  public async getData() {
    return { test: 'data' }
  }
}

class MockResponse extends PikkuHTTPAbstractResponse {
  public statusSet: boolean | undefined
  public ended: boolean | undefined

  public setJson(body: JSONValue): void {
  }
  public setResponse(response: string | Buffer): void {
  }
  public setStatus(code) {
    this.statusSet = code
  }
  public end() {
    this.ended = true
  }
}

const mockCreateSessionServices = async () => ({ sessionServiceMock: true })
function resetGlobalChannels(channels: any[] = [], channelsMeta: any[] = []) {
  // If necessary, reinitialize globalThis.pikku
  if (!globalThis.pikku) {
    globalThis.pikku = {}
  }
  globalThis.pikku.channels = channels
  globalThis.pikku.channelsMeta = channelsMeta
  globalThis.pikku.openChannels = new Map()
}

beforeEach(() => {
  resetGlobalChannels()
})

afterEach(() => {
  resetGlobalChannels()
})

test('runChannel should return undefined and 404 if no matching channel is found', async () => {
  // No channels configured
  resetGlobalChannels()

  const mockResponse = new MockResponse()

  const result = await runLocalChannel({
    singletonServices: mockSingletonServices,
    channelId: 'test-channel-id',
    request: new MockRequest(),
    response: mockResponse,
    route: '/non-existent-channel',
    createSessionServices: mockCreateSessionServices
  })

  assert.equal(
    result,
    undefined,
    'Should return undefined if no channel matches'
  )
  assert.equal(mockResponse.statusSet, 404, 'Should set response status to 404')
  assert.equal(mockResponse.ended, true, 'Should end the response')
})

test('runChannel should return a channel handler if channel matches and no auth required', async () => {
  resetGlobalChannels([
    {
      route: '/test-channel',
      auth: false,
    },
  ])

  // Provide a fake channelPermissionService if needed
  const singletonServicesWithPerm = {
    ...mockSingletonServices,
    channelPermissionService: {
      verifyChannelAccess: async () => {},
    },
  }

  const result = await runLocalChannel({
    singletonServices: singletonServicesWithPerm,
    channelId: 'test-channel-id',
    request: new MockRequest(),
    response: new MockResponse(),
    route: '/test-channel',
    createSessionServices: mockCreateSessionServices
  })

  assert.ok(result, 'Should return a PikkuChannelHandler instance')

  // Simulate opening the channel
  result.open()

  // TODO: Test that the opened channel works
})
