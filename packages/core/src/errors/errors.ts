/**
 * The server cannot or will not process the request due to client error (e.g., malformed request syntax).
 */
import { addError, PikkuError } from './error-handler.js'

/**
 * The server cannot or will not process the request due to client error (e.g., malformed request syntax).
 * @group Error
 */
export class BadRequestError extends PikkuError {}
addError(BadRequestError, {
  status: 400,
  message:
    'The server cannot or will not process the request due to client error (e.g., malformed request syntax).',
})

/**
 * Authentication is required and has failed or has not yet been provided.
 * @group Error
 */
export class UnauthorizedError extends PikkuError {}
/**
 * More specific error to why it's unauthorized.
 * @group Error
 */
export class MissingSessionError extends PikkuError {}
/**
 * More specific error to why it's unauthorized.
 * @group Error
 */
export class InvalidSessionError extends PikkuError {}

addError(UnauthorizedError, {
  status: 401,
  message:
    'Authentication is required and has failed or has not yet been provided.',
})
addError(MissingSessionError, { status: 401, message: 'Session missing.' })
addError(InvalidSessionError, {
  status: 401,
  message: 'The session provided is not valid.',
})

/**
 * Reserved for future use, often related to digital payment or subscription services.
 * @group Error
 */
export class PaymentRequiredError extends PikkuError {}
addError(PaymentRequiredError, {
  status: 402,
  message:
    'Reserved for future use, often related to digital payment or subscription services.',
})

/**
 * The client does not have permission to access the requested resource.
 * @group Error
 */
export class ForbiddenError extends PikkuError {}
addError(ForbiddenError, {
  status: 403,
  message:
    'The client does not have permission to access the requested resource.',
})

/**
 * The request was made from an origin that is not permitted to access this resource.
 * @group Error
 */
export class InvalidOriginError extends PikkuError {}
addError(InvalidOriginError, {
  status: 403,
  message:
    'The request was made from an origin that is not permitted to access this resource.',
})

/**
 * The server cannot find the requested resource.
 * @group Error
 */
export class NotFoundError extends PikkuError {}
/**
 * The server cannot find the requested route.
 * @group Error
 */
addError(NotFoundError, {
  status: 404,
  message: 'The server cannot find the requested resource.',
})

/**
 * The request method is known by the server but is not supported by the resource.
 * @group Error
 */
export class MethodNotAllowedError extends PikkuError {}
addError(MethodNotAllowedError, {
  status: 405,
  message:
    'The request method is known by the server but is not supported by the resource.',
})

/**
 * The requested resource cannot produce a response matching the list of acceptable values in the request's headers.
 * @group Error
 */
export class NotAcceptableError extends PikkuError {}
addError(NotAcceptableError, {
  status: 406,
  message:
    "The requested resource cannot produce a response matching the list of acceptable values in the request's headers.",
})

/**
 * The client must authenticate itself to get the requested response.
 * @group Error
 */
export class ProxyAuthenticationRequiredError extends PikkuError {}
addError(ProxyAuthenticationRequiredError, {
  status: 407,
  message: 'The client must authenticate itself to get the requested response.',
})

/**
 * The server request expired
 * @group Error
 */
export class RequestTimeoutError extends PikkuError {}
addError(RequestTimeoutError, {
  status: 408,
  message: 'The request timeout has expired.',
})

/**
 * The request could not be completed due to a conflict with the current state of the target resource.
 * @group Error
 */
export class ConflictError extends PikkuError {}
addError(ConflictError, {
  status: 409,
  message:
    'The request could not be completed due to a conflict with the current state of the target resource.',
})

/**
 * The resource that is being accessed is no longer available and will not be available again.
 * @group Error
 */
export class GoneError extends PikkuError {}
addError(GoneError, {
  status: 410,
  message:
    'The resource that is being accessed is no longer available and will not be available again.',
})

/**
 * The request did not specify the length of its content, which is required by the requested resource.
 * @group Error
 */
export class LengthRequiredError extends PikkuError {}
addError(LengthRequiredError, {
  status: 411,
  message:
    'The request did not specify the length of its content, which is required by the requested resource.',
})

/**
 * The server does not meet one of the preconditions that the requester put on the request.
 * @group Error
 */
export class PreconditionFailedError extends PikkuError {}
addError(PreconditionFailedError, {
  status: 412,
  message:
    'The server does not meet one of the preconditions that the requester put on the request.',
})

/**
 * The request is larger than the server is willing or able to process.
 * @group Error
 */
export class PayloadTooLargeError extends PikkuError {}
addError(PayloadTooLargeError, {
  status: 413,
  message:
    'The request is larger than the server is willing or able to process.',
})

/**
 * The URI requested by the client is longer than the server is willing to interpret.
 * @group Error
 */
export class URITooLongError extends PikkuError {}
addError(URITooLongError, {
  status: 414,
  message:
    'The URI requested by the client is longer than the server is willing to interpret.',
})

/**
 * The server does not support the media format of the requested data.
 * @group Error
 */
export class UnsupportedMediaTypeError extends PikkuError {}
addError(UnsupportedMediaTypeError, {
  status: 415,
  message:
    'The server does not support the media format of the requested data.',
})

/**
 * The client has asked for a portion of the file, but the server cannot supply that portion.
 * @group Error
 */
export class RangeNotSatisfiableError extends PikkuError {}
addError(RangeNotSatisfiableError, {
  status: 416,
  message:
    'The client has asked for a portion of the file, but the server cannot supply that portion.',
})

/**
 * The server cannot meet the requirements of the Expect request-header field.
 * @group Error
 */
export class ExpectationFailedError extends PikkuError {}
addError(ExpectationFailedError, {
  status: 417,
  message:
    'The server cannot meet the requirements of the Expect request-header field.',
})

/**
 * Indicates that the server understood the content type of the request content, and the syntax of the request content was correct, but it was unable to process the contained instructions.
 * @group Error
 */
export class UnprocessableContentError extends PikkuError {}
addError(UnprocessableContentError, {
  status: 422,
  message:
    'The server understood the content type of the request content, and the syntax of the request content was correct, but it was unable to process the contained instructions..',
})

/**
 * Indicates that the server understood the content type of the request content, and the syntax of the request content was correct, but it was unable to process the contained instructions.
 * @group Error
 */
export class LockedError extends PikkuError {}
addError(LockedError, {
  status: 423,
  message:
    "The resource is locked, meaning it can't be accessed. Its response body should contain information in WebDAV's XML format.",
})

/**
 * The user has sent too many requests in a given amount of time ("rate limiting").
 * @group Error
 */
export class TooManyRequestsError extends PikkuError {}
addError(TooManyRequestsError, {
  status: 429,
  message:
    'The user has sent too many requests in a given amount of time ("rate limiting").',
})

/**
 * A generic error message, given when no more specific message is suitable.
 * @group Error
 */
export class InternalServerError extends PikkuError {}
addError(InternalServerError, {
  status: 500,
  message:
    'A generic error message, given when no more specific message is suitable.',
})

/**
 * The server does not recognize the request method and cannot support it.
 * @group Error
 */
export class NotImplementedError extends PikkuError {}
addError(NotImplementedError, {
  status: 501,
  message:
    'The server does not recognize the request method and cannot support it.',
})

/**
 * The server was acting as a gateway or proxy and received an invalid response from the upstream server.
 * @group Error
 */
export class BadGatewayError extends PikkuError {}
addError(BadGatewayError, {
  status: 502,
  message:
    'The server was acting as a gateway or proxy and received an invalid response from the upstream server.',
})

/**
 * The server is currently unavailable (overloaded or down).
 * @group Error
 */
export class ServiceUnavailableError extends PikkuError {}
addError(ServiceUnavailableError, {
  status: 503,
  message: 'The server is currently unavailable (overloaded or down).',
})

/**
 * The server was acting as a gateway or proxy and did not receive a timely response from the upstream server.
 * @group Error
 */
export class GatewayTimeoutError extends PikkuError {}
addError(GatewayTimeoutError, {
  status: 504,
  message:
    'The server was acting as a gateway or proxy and did not receive a timely response from the upstream server.',
})

/**
 * The server does not support the HTTP protocol version used in the request.
 * @group Error
 */
export class HTTPVersionNotSupportedError extends PikkuError {}
addError(HTTPVersionNotSupportedError, {
  status: 505,
  message:
    'The server does not support the HTTP protocol version used in the request.',
})

/**
 * The server took too long to complete the request, reaching the maximum compute time allowed.
 * @group Error
 */
export class MaxComputeTimeReachedError extends PikkuError {}
addError(MaxComputeTimeReachedError, {
  status: 524,
  message:
    'The server took too long to complete the request, reaching the maximum compute time allowed.',
})
