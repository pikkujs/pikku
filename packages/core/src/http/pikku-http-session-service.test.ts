import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InvalidSessionError, MissingSessionError } from '../errors/errors.js'
import { PikkuHTTPSessionService } from './pikku-http-session-service.js'

test('PikkuHTTPSessionService: Handles JWT-based sessions', async () => {
  const mockJWTService: any = {
    decode: async (token) => {
      if (token === 'validToken') return { id: 1, name: 'Test User' }
      throw new InvalidSessionError()
    },
  }

  const sessionService = new PikkuHTTPSessionService(mockJWTService, {})
  const mockRequest: any = {
    getHeader: (name) =>
      name === 'authorization' ? 'Bearer validToken' : undefined,
    getCookies: () => ({}),
  }

  const session = await sessionService.getUserSession(true, mockRequest)
  assert.deepEqual(session, { id: 1, name: 'Test User' })
})

test('PikkuHTTPSessionService: Handles API key-based sessions', async () => {
  const mockJWTService: any = { decode: async () => undefined }
  const mockOptions = {
    getSessionForAPIKey: async (apiKey) => {
      return apiKey === 'validAPIKey' ? { id: 2, name: 'API User' } : undefined
    },
  }

  const sessionService = new PikkuHTTPSessionService(
    mockJWTService,
    mockOptions
  )
  const mockRequest: any = {
    getHeader: (name) => (name === 'x-api-key' ? 'validAPIKey' : undefined),
    getCookies: () => ({}),
  }

  const session = await sessionService.getUserSession(true, mockRequest)
  assert.deepEqual(session, { id: 2, name: 'API User' })
})

test('PikkuHTTPSessionService: Handles cookie-based sessions', async () => {
  const mockJWTService: any = { decode: async () => undefined }
  const mockOptions = {
    cookieNames: ['session'],
    getSessionForCookieValue: async (cookieValue, cookieName) => {
      if (cookieValue === 'validCookie' && cookieName === 'session') {
        return { id: 3, name: 'Cookie User' }
      }
      return undefined
    },
  }

  const sessionService = new PikkuHTTPSessionService(
    mockJWTService,
    mockOptions
  )
  const mockRequest: any = {
    getHeader: () => undefined,
    getCookies: () => ({ session: 'validCookie' }),
  }

  const session = await sessionService.getUserSession(true, mockRequest)
  assert.deepEqual(session, { id: 3, name: 'Cookie User' })
})

test('PikkuHTTPSessionService: Throws MissingSessionError when credentials are required but missing', async () => {
  const mockJWTService: any = { decode: async () => undefined }
  const sessionService = new PikkuHTTPSessionService(mockJWTService, {})

  const mockRequest: any = {
    getHeader: () => undefined,
    getCookies: () => ({}),
  }

  await assert.rejects(
    sessionService.getUserSession(true, mockRequest),
    MissingSessionError
  )
})

test('PikkuHTTPSessionService: Transforms session when transformSession is provided', async () => {
  const mockJWTService: any = {
    decode: async () => ({ id: 1, name: 'Original User' }),
  }
  const mockOptions = {
    transformSession: async (session) => ({ ...session, transformed: true }),
  }

  const sessionService = new PikkuHTTPSessionService(
    mockJWTService,
    mockOptions
  )
  const mockRequest: any = {
    getHeader: (name) =>
      name === 'authorization' ? 'Bearer validToken' : undefined,
    getCookies: () => ({}),
  }

  const session = await sessionService.getUserSession(true, mockRequest)
  assert.deepEqual(session, { id: 1, name: 'Original User', transformed: true })
})
