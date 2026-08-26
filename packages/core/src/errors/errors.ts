import { addError, PikkuError, declareErrorNames } from './error-handler.js'

export class InvalidMiddlewareWireError extends PikkuError {}
addError(InvalidMiddlewareWireError, {
  status: 500,
  message: 'The middleware wire is invalid for the current wiring type.',
})

export class PikkuMissingMetaError extends PikkuError {}
addError(PikkuMissingMetaError, {
  status: 500,
  message: 'Required metadata is missing',
})

export class MissingServiceError extends PikkuError {}
addError(MissingServiceError, {
  status: 500,
  message: 'A required service is not configured',
})

export class LocalEnvironmentOnlyError extends PikkuError {}
addError(LocalEnvironmentOnlyError, {
  status: 403,
  message: 'This operation is only available in local development mode',
})

export class BadRequestError extends PikkuError {}
addError(BadRequestError, {
  status: 400,
  mcpCode: -32600,
  message:
    'The server cannot or will not process the request due to client error (e.g., malformed request syntax).',
})

export class UnauthorizedError extends PikkuError {}
export class MissingSessionError extends PikkuError {}
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

export class PaymentRequiredError extends PikkuError {}
addError(PaymentRequiredError, {
  status: 402,
  message:
    'Reserved for future use, often related to digital payment or subscription services.',
})

export class ForbiddenError extends PikkuError {}
addError(ForbiddenError, {
  status: 403,
  message:
    'The client does not have permission to access the requested resource.',
})

export class MissingCredentialError extends PikkuError {
  public payload: {
    error: 'missing_credential'
    credentialName: string
    credentialType: 'oauth2' | 'apikey'
    connectUrl?: string
  }

  constructor(
    credentialName: string,
    credentialType: 'oauth2' | 'apikey',
    connectUrl?: string
  ) {
    super(`Missing credential: ${credentialName}`)
    this.payload = {
      error: 'missing_credential',
      credentialName,
      credentialType,
      connectUrl,
    }
  }
}
addError(MissingCredentialError, {
  status: 403,
  message: 'A required credential is not configured.',
})

export class MissingScopeError extends PikkuError {
  public payload: {
    error: 'missing_scope'
    scope: string
  }

  constructor(scope: string) {
    super(`Missing required scope: ${scope}`)
    this.payload = {
      error: 'missing_scope',
      scope,
    }
  }
}
addError(MissingScopeError, {
  status: 403,
  message: 'The session does not hold a scope required by this function.',
})

export class ReadonlySessionError extends PikkuError {}
addError(ReadonlySessionError, {
  status: 403,
  message: 'The session is readonly and cannot access this function.',
})

export class InvalidOriginError extends PikkuError {}
addError(InvalidOriginError, {
  status: 403,
  message:
    'The request was made from an origin that is not permitted to access this resource.',
})

export class NotFoundError extends PikkuError {}
addError(NotFoundError, {
  status: 404,
  mcpCode: -32601,
  message: 'The server cannot find the requested resource.',
})

export class MethodNotAllowedError extends PikkuError {}
addError(MethodNotAllowedError, {
  status: 405,
  message:
    'The request method is known by the server but is not supported by the resource.',
})

export class NotAcceptableError extends PikkuError {}
addError(NotAcceptableError, {
  status: 406,
  message:
    "The requested resource cannot produce a response matching the list of acceptable values in the request's headers.",
})

export class ProxyAuthenticationRequiredError extends PikkuError {}
addError(ProxyAuthenticationRequiredError, {
  status: 407,
  message: 'The client must authenticate itself to get the requested response.',
})

export class RequestTimeoutError extends PikkuError {}
addError(RequestTimeoutError, {
  status: 408,
  message: 'The request timeout has expired.',
})

export class ConflictError extends PikkuError {}
addError(ConflictError, {
  status: 409,
  message:
    'The request could not be completed due to a conflict with the current state of the target resource.',
})

export class GoneError extends PikkuError {}
addError(GoneError, {
  status: 410,
  message:
    'The resource that is being accessed is no longer available and will not be available again.',
})

export class LengthRequiredError extends PikkuError {}
addError(LengthRequiredError, {
  status: 411,
  message:
    'The request did not specify the length of its content, which is required by the requested resource.',
})

export class PreconditionFailedError extends PikkuError {}
addError(PreconditionFailedError, {
  status: 412,
  message:
    'The server does not meet one of the preconditions that the requester put on the request.',
})

export class PayloadTooLargeError extends PikkuError {}
addError(PayloadTooLargeError, {
  status: 413,
  message:
    'The request is larger than the server is willing or able to process.',
})

export class URITooLongError extends PikkuError {}
addError(URITooLongError, {
  status: 414,
  message:
    'The URI requested by the client is longer than the server is willing to interpret.',
})

export class UnsupportedMediaTypeError extends PikkuError {}
addError(UnsupportedMediaTypeError, {
  status: 415,
  message:
    'The server does not support the media format of the requested data.',
})

export class RangeNotSatisfiableError extends PikkuError {}
addError(RangeNotSatisfiableError, {
  status: 416,
  message:
    'The client has asked for a portion of the file, but the server cannot supply that portion.',
})

export class ExpectationFailedError extends PikkuError {}
addError(ExpectationFailedError, {
  status: 417,
  message:
    'The server cannot meet the requirements of the Expect request-header field.',
})

export class UnprocessableContentError extends PikkuError {}
addError(UnprocessableContentError, {
  status: 422,
  message:
    'The server understood the content type of the request content, and the syntax of the request content was correct, but it was unable to process the contained instructions..',
})

export class LockedError extends PikkuError {}
addError(LockedError, {
  status: 423,
  message:
    "The resource is locked, meaning it can't be accessed. Its response body should contain information in WebDAV's XML format.",
})

export class TooManyRequestsError extends PikkuError {}
addError(TooManyRequestsError, {
  status: 429,
  message:
    'The user has sent too many requests in a given amount of time ("rate limiting").',
})

export class InternalServerError extends PikkuError {}
addError(InternalServerError, {
  status: 500,
  message:
    'A generic error message, given when no more specific message is suitable.',
})

export class NotImplementedError extends PikkuError {}
addError(NotImplementedError, {
  status: 501,
  message:
    'The server does not recognize the request method and cannot support it.',
})

export class BadGatewayError extends PikkuError {}
addError(BadGatewayError, {
  status: 502,
  message:
    'The server was acting as a gateway or proxy and received an invalid response from the upstream server.',
})

export class ServiceUnavailableError extends PikkuError {}
addError(ServiceUnavailableError, {
  status: 503,
  message: 'The server is currently unavailable (overloaded or down).',
})

export class GatewayTimeoutError extends PikkuError {}
addError(GatewayTimeoutError, {
  status: 504,
  message:
    'The server was acting as a gateway or proxy and did not receive a timely response from the upstream server.',
})

export class HTTPVersionNotSupportedError extends PikkuError {}
addError(HTTPVersionNotSupportedError, {
  status: 505,
  message:
    'The server does not support the HTTP protocol version used in the request.',
})

export class MaxComputeTimeReachedError extends PikkuError {}
addError(MaxComputeTimeReachedError, {
  status: 524,
  message:
    'The server took too long to complete the request, reaching the maximum compute time allowed.',
})

export class MissingSchemaError extends PikkuError {}
addError(MissingSchemaError, {
  status: 500,
  message:
    'A required schema was not found. Ensure schema generation has been run.',
})

export class WeakKeyMaterialError extends PikkuError {
  constructor(name: string, minimumLength: number, actualLength: number) {
    super(
      `${name} must be at least ${minimumLength} characters of high-entropy key material, got ${actualLength}. Generate one with \`openssl rand -base64 32\` and redeploy every service that shares it.`
    )
  }
}
addError(WeakKeyMaterialError, {
  status: 500,
  message: 'A configured secret does not carry enough entropy to be used.',
})

export class AIProviderNotConfiguredError extends PikkuError {
  constructor() {
    super(
      'No AI provider configured. Please set up an AI provider (e.g. OpenAI, Anthropic) and provide a valid API key to use this agent.'
    )
  }
}
addError(AIProviderNotConfiguredError, {
  status: 503,
  message:
    'No AI provider configured. Please set up an AI provider (e.g. OpenAI, Anthropic) and provide a valid API key to use this agent.',
})

export class AIProviderAuthError extends PikkuError {
  constructor(message?: string) {
    super(
      message ||
        'AI provider API key is missing or invalid. Please check your API key configuration.'
    )
  }
}
addError(AIProviderAuthError, {
  status: 401,
  message:
    'AI provider API key is missing or invalid. Please check your API key configuration.',
})

/**
 * An administrative operation targeted a role that is declared in code.
 *
 * System roles ship with the product: the console may show and grant them, but
 * renaming, re-scoping or deleting one would let a UI action silently change
 * what a declared persona means, and what every scenario written against that
 * role is actually testing.
 * @group Error
 */
export class SystemRoleImmutableError extends PikkuError {
  public payload: {
    error: 'system_role_immutable'
    role: string
    operation: string
  }

  constructor(role: string, operation: string) {
    super(
      `Cannot ${operation} '${role}': it is a system role, declared in code with defineSystemRole. ` +
        `Edit the declaration, or create a separate role in the console.`
    )
    this.payload = {
      error: 'system_role_immutable',
      role,
      operation,
    }
  }
}
addError(SystemRoleImmutableError, {
  status: 409,
  message: 'This role is declared in code and cannot be changed here.',
})

/**
 * A role was created with the name of a role declared in code.
 *
 * Shadowing is refused rather than merged: two rows answering to one name make
 * "does Susan hold `buyer`?" depend on which one the store happened to return.
 * @group Error
 */
export class SystemRoleShadowedError extends PikkuError {
  public payload: {
    error: 'system_role_shadowed'
    role: string
  }

  constructor(role: string) {
    super(
      `Cannot create role '${role}': a system role of that name is declared in code.`
    )
    this.payload = {
      error: 'system_role_shadowed',
      role,
    }
  }
}
addError(SystemRoleShadowedError, {
  status: 409,
  message: 'A system role of that name is already declared in code.',
})

/**
 * The wire name of every error above, as string literals the deploy bundle's
 * minifier cannot rewrite — `error.name` is part of the contract a client
 * reads, so it must not be the constructor identifier.
 */
declareErrorNames({
  InvalidMiddlewareWireError,
  PikkuMissingMetaError,
  MissingServiceError,
  LocalEnvironmentOnlyError,
  BadRequestError,
  UnauthorizedError,
  MissingSessionError,
  InvalidSessionError,
  PaymentRequiredError,
  ForbiddenError,
  MissingCredentialError,
  MissingScopeError,
  ReadonlySessionError,
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
  WeakKeyMaterialError,
  AIProviderNotConfiguredError,
  AIProviderAuthError,
  SystemRoleImmutableError,
  SystemRoleShadowedError,
})
