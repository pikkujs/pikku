import { test, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { JSONValue } from '../../types/core.types.js'
import { PikkuHTTPAbstractRequest } from '../../http/pikku-http-abstract-request.js'
import { PikkuHTTPAbstractResponse } from '../../http/pikku-http-abstract-response.js'
import { runLocalChannel } from './local-channel-runner.js'
import { resetPikkuState } from '../../pikku-state.js'
import { addChannel } from '../channel-runner.js'

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

  public setJson(body: JSONValue): void {}
  public setResponse(response: string | Buffer): void {}
  public setStatus(code) {
    this.statusSet = code
  }
  public end() {
    this.ended = true
  }
}

const mockCreateSessionServices = async () => ({ sessionServiceMock: true })

beforeEach(() => {
  resetPikkuState()
})

afterEach(() => {
  resetPikkuState()
})

test('runChannel should return undefined and 404 if no matching channel is found', async () => {
  const mockResponse = new MockResponse()

  const result = await runLocalChannel({
    singletonServices: mockSingletonServices,
    channelId: 'test-channel-id',
    request: new MockRequest('/non-existent-channel', 'get'),
    response: mockResponse,
    route: '/non-existent-channel',
    createSessionServices: mockCreateSessionServices,
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
  resetPikkuState()
  addChannel({
    name: 'test',
    route: '/test-channel',
    auth: false,
  })

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
    request: new MockRequest('/test-channel', 'get'),
    response: new MockResponse(),
    route: '/test-channel',
    createSessionServices: mockCreateSessionServices,
  })

  assert.ok(result, 'Should return a PikkuChannelHandler instance')

  // Simulate opening the channel
  result.open()

  // TODO: Test that the opened channel works
})
