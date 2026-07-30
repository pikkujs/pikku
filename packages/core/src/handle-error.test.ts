import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { handleHTTPError } from './handle-error.js'
import { addError, PikkuError } from './errors/error-handler.js'
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  MissingScopeError,
} from './errors/errors.js'
import { resetPikkuState } from './pikku-state.js'

const createMockLogger = () => {
  const logs: { level: string; args: any[] }[] = []
  return {
    info: (...args: any[]) => logs.push({ level: 'info', args }),
    warn: (...args: any[]) => logs.push({ level: 'warn', args }),
    error: (...args: any[]) => logs.push({ level: 'error', args }),
    debug: (...args: any[]) => logs.push({ level: 'debug', args }),
    _logs: logs,
  }
}

const createMockHTTP = () => {
  const state = {
    statusCode: undefined as number | undefined,
    jsonBody: undefined as any,
    closed: false,
  }
  return {
    request: {},
    response: {
      status: (code: number) => {
        state.statusCode = code
        return {
          json: (body: any) => {
            state.jsonBody = body
          },
        }
      },
      json: (body: any) => {
        state.jsonBody = body
      },
      close: () => {
        state.closed = true
      },
    },
    _state: state,
  }
}

beforeEach(() => {
  resetPikkuState()
})

describe('handleHTTPError', () => {
  test('should skip NotFoundError when respondWith404 is false', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new NotFoundError()

    handleHTTPError(
      error,
      http as any,
      'tracker-1',
      logger as any,
      [],
      false,
      false
    )

    assert.strictEqual(http._state.statusCode, undefined)
    assert.strictEqual(http._state.jsonBody, undefined)
  })

  test('should handle NotFoundError when respondWith404 is true', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new NotFoundError()

    handleHTTPError(
      error,
      http as any,
      'tracker-1',
      logger as any,
      [],
      true,
      false
    )

    assert.strictEqual(http._state.statusCode, 404)
    assert.deepStrictEqual(http._state.jsonBody, {
      name: 'NotFoundError',
      message: 'The server cannot find the requested resource.',
      payload: undefined,
      errorId: 'tracker-1',
    })
  })

  test('should set correct status and message for known errors', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new BadRequestError('Invalid input')

    handleHTTPError(
      error,
      http as any,
      'tracker-2',
      logger as any,
      [],
      true,
      false
    )

    assert.strictEqual(http._state.statusCode, 400)
    assert.strictEqual(http._state.jsonBody.message, 'Invalid input')
    assert.strictEqual(http._state.jsonBody.errorId, 'tracker-2')
  })

  test('should set status 403 for ForbiddenError', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new ForbiddenError()

    handleHTTPError(
      error,
      http as any,
      'tracker-3',
      logger as any,
      [],
      true,
      false
    )

    assert.strictEqual(http._state.statusCode, 403)
  })

  test('should log warning when status code is in logWarningsForStatusCodes', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new BadRequestError('bad')

    handleHTTPError(
      error,
      http as any,
      'tracker-4',
      logger as any,
      [400],
      true,
      false
    )

    const warns = logger._logs.filter((l) => l.level === 'warn')
    assert.ok(warns.length >= 1)
    assert.ok(warns.some((w) => w.args[0].includes('tracker-4')))
  })

  test('should not log warning when status code is not in logWarningsForStatusCodes', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new BadRequestError('bad')

    handleHTTPError(
      error,
      http as any,
      'tracker-5',
      logger as any,
      [500],
      true,
      false
    )

    const warns = logger._logs.filter((l) => l.level === 'warn')
    assert.strictEqual(warns.length, 0)
  })

  test('should handle unknown errors with 500 status', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new Error('something unexpected')

    handleHTTPError(
      error,
      http as any,
      'tracker-6',
      logger as any,
      [],
      true,
      false
    )

    assert.strictEqual(http._state.statusCode, 500)
    assert.deepStrictEqual(http._state.jsonBody, { errorId: 'tracker-6' })
  })

  test('should log unknown errors with error level', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new Error('unexpected')

    handleHTTPError(
      error,
      http as any,
      undefined,
      logger as any,
      [],
      true,
      false
    )

    const errors = logger._logs.filter((l) => l.level === 'error')
    assert.ok(errors.length >= 1)
    assert.ok(errors.some((e) => e.args[0] === 'unexpected'))
  })

  test('should not include errorId in response when trackerId is undefined for unknown errors', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new Error('unexpected')

    handleHTTPError(
      error,
      http as any,
      undefined,
      logger as any,
      [],
      true,
      false
    )

    assert.strictEqual(http._state.statusCode, 500)
    assert.strictEqual(http._state.jsonBody, undefined)
  })

  test('should bubble error when bubbleError is true', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new BadRequestError('bad')

    assert.throws(
      () =>
        handleHTTPError(
          error,
          http as any,
          'tracker',
          logger as any,
          [],
          true,
          true
        ),
      (e: any) => e === error
    )
  })

  test('should not bubble error when bubbleError is false', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new BadRequestError('bad')

    handleHTTPError(
      error,
      http as any,
      'tracker',
      logger as any,
      [],
      true,
      false
    )
    // Should not throw
  })

  test('should not call response.close automatically', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new BadRequestError('bad')

    handleHTTPError(
      error,
      http as any,
      'tracker',
      logger as any,
      [],
      true,
      false
    )

    assert.strictEqual(http._state.closed, false)
  })

  test('should handle undefined http gracefully', () => {
    const logger = createMockLogger()
    const error = new BadRequestError('bad')

    handleHTTPError(error, undefined, 'tracker', logger as any, [], true, false)
    // Should not throw
  })

  test('should include payload from error in known error response', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new BadRequestError('bad') as any
    error.payload = { field: 'email', reason: 'invalid' }

    handleHTTPError(
      error,
      http as any,
      'tracker',
      logger as any,
      [],
      true,
      false
    )

    assert.deepStrictEqual(http._state.jsonBody.payload, {
      field: 'email',
      reason: 'invalid',
    })
  })

  test('should handle non-Error objects as errors', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = 'just a string error'

    handleHTTPError(
      error,
      http as any,
      'tracker',
      logger as any,
      [],
      true,
      false
    )

    assert.strictEqual(http._state.statusCode, 500)
    const errors = logger._logs.filter((l) => l.level === 'error')
    assert.ok(errors.some((e) => e.args[0] === 'just a string error'))
  })

  test('should include message and stack when exposeErrors is true', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new Error('something unexpected')

    handleHTTPError(
      error,
      http as any,
      'tracker-expose',
      logger as any,
      [],
      true,
      false,
      true
    )

    assert.strictEqual(http._state.statusCode, 500)
    assert.strictEqual(http._state.jsonBody.errorId, 'tracker-expose')
    assert.strictEqual(http._state.jsonBody.message, 'something unexpected')
    assert.ok(typeof http._state.jsonBody.stack === 'string')
  })

  test('should not include message and stack when exposeErrors is false', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new Error('something unexpected')

    handleHTTPError(
      error,
      http as any,
      'tracker-no-expose',
      logger as any,
      [],
      true,
      false,
      false
    )

    assert.strictEqual(http._state.statusCode, 500)
    assert.deepStrictEqual(http._state.jsonBody, {
      errorId: 'tracker-no-expose',
    })
  })

  test('should not expose details for non-Error objects even when exposeErrors is true', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()

    handleHTTPError(
      'string error',
      http as any,
      'tracker-str',
      logger as any,
      [],
      true,
      false,
      true
    )

    assert.strictEqual(http._state.statusCode, 500)
    assert.deepStrictEqual(http._state.jsonBody, { errorId: 'tracker-str' })
  })

  test('should not leak the payload of a registered server error', () => {
    class LeakyInternalError extends PikkuError {}
    addError(LeakyInternalError, {
      status: 500,
      message: 'Something went wrong',
    })

    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new LeakyInternalError(
      'connection to 10.0.0.1 refused'
    ) as any
    error.payload = { connectionString: 'postgres://user:hunter2@10.0.0.1' }

    handleHTTPError(
      error,
      http as any,
      'tracker-leak',
      logger as any,
      [],
      true,
      false
    )

    assert.strictEqual(http._state.statusCode, 500)
    assert.strictEqual(http._state.jsonBody.payload, undefined)
  })

  test('should not leak the raw message of a registered server error', () => {
    class InternalMessageError extends PikkuError {}
    addError(InternalMessageError, {
      status: 500,
      message: 'Something went wrong',
    })

    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new InternalMessageError('secret internal detail')

    handleHTTPError(
      error,
      http as any,
      'tracker-msg',
      logger as any,
      [],
      true,
      false
    )

    assert.strictEqual(http._state.statusCode, 500)
    assert.strictEqual(http._state.jsonBody.message, 'Something went wrong')
  })

  test('should keep the payload of a client facing error', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new MissingScopeError('admin:write')

    handleHTTPError(
      error,
      http as any,
      'tracker-scope',
      logger as any,
      [],
      true,
      false
    )

    assert.strictEqual(http._state.statusCode, 403)
    assert.deepStrictEqual(http._state.jsonBody.payload, {
      error: 'missing_scope',
      scope: 'admin:write',
    })
    assert.strictEqual(
      http._state.jsonBody.message,
      'Missing required scope: admin:write'
    )
  })

  test('should expose server error details when exposeErrors is true', () => {
    class ExposableInternalError extends PikkuError {}
    addError(ExposableInternalError, {
      status: 500,
      message: 'Something went wrong',
    })

    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new ExposableInternalError('internal detail') as any
    error.payload = { debug: true }

    handleHTTPError(
      error,
      http as any,
      'tracker-expose-known',
      logger as any,
      [],
      true,
      false,
      true
    )

    assert.strictEqual(http._state.jsonBody.message, 'internal detail')
    assert.deepStrictEqual(http._state.jsonBody.payload, { debug: true })
  })

  test('should handle warning log without trackerId', () => {
    const logger = createMockLogger()
    const http = createMockHTTP()
    const error = new BadRequestError('bad')

    handleHTTPError(
      error,
      http as any,
      undefined,
      logger as any,
      [400],
      true,
      false
    )

    const warns = logger._logs.filter((l) => l.level === 'warn')
    assert.ok(warns.length >= 1)
    assert.ok(
      !warns.some(
        (w) => typeof w.args[0] === 'string' && w.args[0].includes('Warning id')
      )
    )
  })
})
