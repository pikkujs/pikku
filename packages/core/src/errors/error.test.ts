import { test, describe } from 'node:test'
import assert from 'assert'
import {
  getErrorResponse,
  addError,
  addErrors,
  PikkuError,
} from './error-handler.js'
import {
  BadRequestError,
  UnauthorizedError,
  MissingSessionError,
  InvalidSessionError,
  PaymentRequiredError,
  ForbiddenError,
  InvalidOriginError,
  NotFoundError,
  MethodNotAllowedError,
  NotAcceptableError,
  ProxyAuthenticationRequiredError,
  RequestTimeoutError,
  ConflictError,
  GoneError,
  LengthRequiredError,
  PreconditionFailedError,
  PayloadTooLargeError,
  URITooLongError,
  UnsupportedMediaTypeError,
  RangeNotSatisfiableError,
  ExpectationFailedError,
  UnprocessableContentError,
  LockedError,
  TooManyRequestsError,
  InternalServerError,
  NotImplementedError,
  BadGatewayError,
  ServiceUnavailableError,
  GatewayTimeoutError,
  HTTPVersionNotSupportedError,
  MaxComputeTimeReachedError,
  MissingSchemaError,
  InvalidMiddlewareWireError,
  PikkuMissingMetaError,
} from './errors.js'

describe('PikkuError', () => {
  test('should create error with default message', () => {
    const error = new PikkuError()
    assert.strictEqual(error.message, 'An error occurred')
  })

  test('should create error with custom message', () => {
    const error = new PikkuError('custom message')
    assert.strictEqual(error.message, 'custom message')
  })

  test('should be instance of Error', () => {
    const error = new PikkuError()
    assert.ok(error instanceof Error)
  })

  test('should be instance of PikkuError', () => {
    const error = new PikkuError()
    assert.ok(error instanceof PikkuError)
  })

  test('subclasses should be instanceof PikkuError', () => {
    assert.ok(new BadRequestError() instanceof PikkuError)
    assert.ok(new NotFoundError() instanceof PikkuError)
    assert.ok(new ForbiddenError() instanceof PikkuError)
  })
})

describe('getErrorResponse', () => {
  test('should return the correct error response for BadRequestError', () => {
    const error = new BadRequestError()
    const response = getErrorResponse(error)
    assert.deepStrictEqual(response, {
      status: 400,
      message:
        'The server cannot or will not process the request due to client error (e.g., malformed request syntax).',
    })
  })

  test('should return the correct error response for NotFoundError', () => {
    const error = new NotFoundError()
    const response = getErrorResponse(error)
    assert.deepStrictEqual(response, {
      status: 404,
      message: 'The server cannot find the requested resource.',
    })
  })

  test('should return the correct error response for ForbiddenError', () => {
    const error = new ForbiddenError()
    const response = getErrorResponse(error)
    assert.deepStrictEqual(response, {
      status: 403,
      message:
        'The client does not have permission to access the requested resource.',
    })
  })

  test('should return undefined for an unknown error', () => {
    class UnknownError extends Error {}
    const error = new UnknownError()
    const response = getErrorResponse(error)
    assert.strictEqual(response, undefined)
  })

  test('should return the correct error response for a custom error added to apiErrors', () => {
    class CustomError extends Error {}
    const customError = new CustomError()
    const customErrorDetails = { status: 400, message: 'Custom Error' }

    // Add the custom error to the apiErrors map
    addError(CustomError, customErrorDetails)

    const response = getErrorResponse(customError)
    assert.deepStrictEqual(response, customErrorDetails)
  })
})

describe('addErrors', () => {
  test('should register multiple errors at once', () => {
    class ErrA extends Error {}
    class ErrB extends Error {}
    addErrors([
      [ErrA, { status: 450, message: 'Error A' }],
      [ErrB, { status: 451, message: 'Error B' }],
    ])
    assert.deepStrictEqual(getErrorResponse(new ErrA()), {
      status: 450,
      message: 'Error A',
    })
    assert.deepStrictEqual(getErrorResponse(new ErrB()), {
      status: 451,
      message: 'Error B',
    })
  })
})

describe('all built-in error classes', () => {
  const errorCases: [string, any, number][] = [
    ['InvalidMiddlewareWireError', InvalidMiddlewareWireError, 500],
    ['PikkuMissingMetaError', PikkuMissingMetaError, 500],
    ['BadRequestError', BadRequestError, 400],
    ['UnauthorizedError', UnauthorizedError, 401],
    ['MissingSessionError', MissingSessionError, 401],
    ['InvalidSessionError', InvalidSessionError, 401],
    ['PaymentRequiredError', PaymentRequiredError, 402],
    ['ForbiddenError', ForbiddenError, 403],
    ['InvalidOriginError', InvalidOriginError, 403],
    ['NotFoundError', NotFoundError, 404],
    ['MethodNotAllowedError', MethodNotAllowedError, 405],
    ['NotAcceptableError', NotAcceptableError, 406],
    ['ProxyAuthenticationRequiredError', ProxyAuthenticationRequiredError, 407],
    ['RequestTimeoutError', RequestTimeoutError, 408],
    ['ConflictError', ConflictError, 409],
    ['GoneError', GoneError, 410],
    ['LengthRequiredError', LengthRequiredError, 411],
    ['PreconditionFailedError', PreconditionFailedError, 412],
    ['PayloadTooLargeError', PayloadTooLargeError, 413],
    ['URITooLongError', URITooLongError, 414],
    ['UnsupportedMediaTypeError', UnsupportedMediaTypeError, 415],
    ['RangeNotSatisfiableError', RangeNotSatisfiableError, 416],
    ['ExpectationFailedError', ExpectationFailedError, 417],
    ['UnprocessableContentError', UnprocessableContentError, 422],
    ['LockedError', LockedError, 423],
    ['TooManyRequestsError', TooManyRequestsError, 429],
    ['InternalServerError', InternalServerError, 500],
    ['NotImplementedError', NotImplementedError, 501],
    ['BadGatewayError', BadGatewayError, 502],
    ['ServiceUnavailableError', ServiceUnavailableError, 503],
    ['GatewayTimeoutError', GatewayTimeoutError, 504],
    ['HTTPVersionNotSupportedError', HTTPVersionNotSupportedError, 505],
    ['MaxComputeTimeReachedError', MaxComputeTimeReachedError, 524],
    ['MissingSchemaError', MissingSchemaError, 500],
  ]

  for (const [name, ErrorClass, expectedStatus] of errorCases) {
    test(`${name} should map to status ${expectedStatus}`, () => {
      const error = new ErrorClass()
      const response = getErrorResponse(error)
      assert.ok(response, `Expected error response for ${name}`)
      assert.strictEqual(response!.status, expectedStatus)
      assert.ok(response!.message.length > 0)
    })

    test(`${name} should be instance of PikkuError`, () => {
      const error = new ErrorClass()
      assert.ok(error instanceof PikkuError)
    })
  }
})
