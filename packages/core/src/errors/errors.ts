import { addError, PikkuError } from './error-handler.js'

/**
 * A middleware was attached to a wiring type it cannot run on. Answers 500.
 * @group Error
 */
export class InvalidMiddlewareWireError extends PikkuError {}
addError(InvalidMiddlewareWireError, {
  status: 500,
  message: 'The middleware wire is invalid for the current wiring type.',
})

/**
 * The generated metadata for a wiring (a queue worker, trigger, workflow, …) is
 * missing at runtime, usually because `pikku` codegen was not re-run after a
 * change. Answers 500.
 * @group Error
 */
export class PikkuMissingMetaError extends PikkuError {}
addError(PikkuMissingMetaError, {
  status: 500,
  message: 'Required metadata is missing',
})

/**
 * A function needed a service that was not created in your singleton or wire
 * services factory. Answers 500.
 * @group Error
 */
export class MissingServiceError extends PikkuError {}
addError(MissingServiceError, {
  status: 500,
  message: 'A required service is not configured',
})

/**
 * A development-only operation was called outside local development. Answers
 * 403.
 * @group Error
 */
export class LocalEnvironmentOnlyError extends PikkuError {}
addError(LocalEnvironmentOnlyError, {
  status: 403,
  message: 'This operation is only available in local development mode',
})

/**
 * The request is malformed or its data failed validation. Answers 400 (JSON-RPC
 * `-32600` over MCP).
 * @group Error
 */
export class BadRequestError extends PikkuError {}
addError(BadRequestError, {
  status: 400,
  mcpCode: -32600,
  message:
    'The server cannot or will not process the request due to client error (e.g., malformed request syntax).',
})

/**
 * Authentication was attempted and failed for a reason that is not about the
 * session itself, such as a bad webhook signature or dispatch secret. Answers
 * 401.
 * @group Error
 */
export class UnauthorizedError extends PikkuError {}
/**
 * No session was resolved for a function that requires one: either a
 * `pikkuFunc`, or a sessionless function wired or configured with
 * `auth: true`. Answers 401 — the caller has to sign in. Contrast
 * {@link InvalidSessionError} (credentials were sent but are not valid) and
 * {@link ForbiddenError} (signed in, but not allowed).
 * @group Error
 */
export class MissingSessionError extends PikkuError {}
/**
 * Credentials were presented but could not be turned into a session, for
 * example an `Authorization` header that is not a well-formed `Bearer` token.
 * Answers 401; the caller should re-authenticate rather than retry.
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
 * The operation needs a paid plan or payment. Answers 402.
 * @group Error
 */
export class PaymentRequiredError extends PikkuError {}
addError(PaymentRequiredError, {
  status: 402,
  message:
    'Reserved for future use, often related to digital payment or subscription services.',
})

/**
 * The caller is authenticated but a permission (global, wiring or function
 * level) refused the call. Answers 403 — signing in again will not help.
 * Authentication failures are {@link MissingSessionError} and
 * {@link InvalidSessionError} instead.
 * @group Error
 */
export class ForbiddenError extends PikkuError {}
addError(ForbiddenError, {
  status: 403,
  message:
    'The client does not have permission to access the requested resource.',
})

/**
 * A function needs a per-user credential (OAuth2 or API key) that the user has
 * not connected yet. Answers 403; `payload` names the credential and, when
 * known, the `connectUrl` the client should send the user to.
 * @group Error
 */
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

/**
 * The upstream service refused a stored credential. Answers 403; `payload.reauth`
 * says whether the user has to sign in again or reconnect the credential.
 * @group Error
 */
export class CredentialRejectedError extends PikkuError {
  public payload: {
    error: 'credential_rejected'
    credentialName: string
    reauth: 'sign-in' | 'connect'
  }

  constructor(
    credentialName: string,
    reauth: 'sign-in' | 'connect',
    message?: string
  ) {
    super(
      message ??
        (reauth === 'sign-in'
          ? `${credentialName} rejected the stored session — sign in again`
          : `${credentialName} rejected the stored credential — reconnect it`)
    )
    this.payload = { error: 'credential_rejected', credentialName, reauth }
  }
}
addError(CredentialRejectedError, {
  status: 403,
  message:
    'The upstream service rejected the stored credential; the user has to sign in again or reconnect it.',
})

/**
 * The session does not hold a scope the function (or the addon running it)
 * requires. Answers 403; `payload.scope` names the missing scope.
 * @group Error
 */
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

/**
 * A feature flag guarding the function is switched off. Answers 503, so the
 * caller treats it as temporary and retryable rather than as a permission
 * problem; `payload.feature` names the flag.
 * @group Error
 */
export class FeatureUnavailableError extends PikkuError {
  public payload: {
    error: 'feature_unavailable'
    feature: string
  }

  constructor(feature: string) {
    super(`Feature is currently unavailable: ${feature}`)
    this.payload = {
      error: 'feature_unavailable',
      feature,
    }
  }
}

// 503 and not 403: a killed feature is a server-side, temporary, not-your-fault
// condition, and it should be retryable and monitorable as one. A 403 here
// would page the wrong team and tell the caller to fix something they cannot.
addError(FeatureUnavailableError, {
  status: 503,
  message: 'This feature is switched off.',
})

/**
 * A session with `readonly: true` called a function that is not declared
 * `readonly`. Answers 403.
 * @group Error
 */
export class ReadonlySessionError extends PikkuError {}
addError(ReadonlySessionError, {
  status: 403,
  message: 'The session is readonly and cannot access this function.',
})

/**
 * The request's `Origin` is not on the allowlist of the `requireOrigin`
 * middleware, the CSRF guard for cookie-authenticated routes. Answers 403.
 * @group Error
 */
export class InvalidOriginError extends PikkuError {}
addError(InvalidOriginError, {
  status: 403,
  message:
    'The request was made from an origin that is not permitted to access this resource.',
})

/**
 * The requested resource does not exist. Answers 404 (JSON-RPC `-32601` over
 * MCP).
 * @group Error
 */
export class NotFoundError extends PikkuError {}
addError(NotFoundError, {
  status: 404,
  mcpCode: -32601,
  message: 'The server cannot find the requested resource.',
})

/**
 * The resource exists but does not accept this HTTP method. Answers 405.
 * @group Error
 */
export class MethodNotAllowedError extends PikkuError {}
addError(MethodNotAllowedError, {
  status: 405,
  message:
    'The request method is known by the server but is not supported by the resource.',
})

/**
 * No representation matches the request's `Accept` headers. Answers 406.
 * @group Error
 */
export class NotAcceptableError extends PikkuError {}
addError(NotAcceptableError, {
  status: 406,
  message:
    "The requested resource cannot produce a response matching the list of acceptable values in the request's headers.",
})

/**
 * Authentication with a proxy is required. Answers 407.
 * @group Error
 */
export class ProxyAuthenticationRequiredError extends PikkuError {}
addError(ProxyAuthenticationRequiredError, {
  status: 407,
  message: 'The client must authenticate itself to get the requested response.',
})

/**
 * The request took too long to arrive. Answers 408.
 * @group Error
 */
export class RequestTimeoutError extends PikkuError {}
addError(RequestTimeoutError, {
  status: 408,
  message: 'The request timeout has expired.',
})

/**
 * The request conflicts with the current state of the resource, such as a
 * duplicate or a stale write. Answers 409.
 * @group Error
 */
export class ConflictError extends PikkuError {}
addError(ConflictError, {
  status: 409,
  message:
    'The request could not be completed due to a conflict with the current state of the target resource.',
})

/**
 * The resource existed but has been permanently removed. Answers 410.
 * @group Error
 */
export class GoneError extends PikkuError {}
addError(GoneError, {
  status: 410,
  message:
    'The resource that is being accessed is no longer available and will not be available again.',
})

/**
 * The request has no `Content-Length` and one is required. Answers 411.
 * @group Error
 */
export class LengthRequiredError extends PikkuError {}
addError(LengthRequiredError, {
  status: 411,
  message:
    'The request did not specify the length of its content, which is required by the requested resource.',
})

/**
 * A conditional request header (`If-Match`, …) did not hold. Answers 412.
 * @group Error
 */
export class PreconditionFailedError extends PikkuError {}
addError(PreconditionFailedError, {
  status: 412,
  message:
    'The server does not meet one of the preconditions that the requester put on the request.',
})

/**
 * The request body exceeds the configured maximum body size; the HTTP request
 * adapters throw it while reading the body. Answers 413.
 * @group Error
 */
export class PayloadTooLargeError extends PikkuError {}
addError(PayloadTooLargeError, {
  status: 413,
  message:
    'The request is larger than the server is willing or able to process.',
})

/**
 * The request URI is longer than the server accepts. Answers 414.
 * @group Error
 */
export class URITooLongError extends PikkuError {}
addError(URITooLongError, {
  status: 414,
  message:
    'The URI requested by the client is longer than the server is willing to interpret.',
})

/**
 * The request body's content type is not supported. Answers 415.
 * @group Error
 */
export class UnsupportedMediaTypeError extends PikkuError {}
addError(UnsupportedMediaTypeError, {
  status: 415,
  message:
    'The server does not support the media format of the requested data.',
})

/**
 * The requested byte range cannot be served. Answers 416.
 * @group Error
 */
export class RangeNotSatisfiableError extends PikkuError {}
addError(RangeNotSatisfiableError, {
  status: 416,
  message:
    'The client has asked for a portion of the file, but the server cannot supply that portion.',
})

/**
 * The `Expect` request header cannot be met. Answers 417.
 * @group Error
 */
export class ExpectationFailedError extends PikkuError {}
addError(ExpectationFailedError, {
  status: 417,
  message:
    'The server cannot meet the requirements of the Expect request-header field.',
})

/**
 * The request is well-formed but semantically invalid. Answers 422.
 * @group Error
 */
export class UnprocessableContentError extends PikkuError {}
addError(UnprocessableContentError, {
  status: 422,
  message:
    'The server understood the content type of the request content, and the syntax of the request content was correct, but it was unable to process the contained instructions..',
})

/**
 * The resource is locked. Answers 423.
 * @group Error
 */
export class LockedError extends PikkuError {}
addError(LockedError, {
  status: 423,
  message:
    "The resource is locked, meaning it can't be accessed. Its response body should contain information in WebDAV's XML format.",
})

/**
 * The caller has been rate limited. Answers 429.
 * @group Error
 */
export class TooManyRequestsError extends PikkuError {}
addError(TooManyRequestsError, {
  status: 429,
  message:
    'The user has sent too many requests in a given amount of time ("rate limiting").',
})

/**
 * A generic server-side failure with no more specific error. Answers 500.
 * @group Error
 */
export class InternalServerError extends PikkuError {}
addError(InternalServerError, {
  status: 500,
  message:
    'A generic error message, given when no more specific message is suitable.',
})

/**
 * The operation is not implemented. Answers 501.
 * @group Error
 */
export class NotImplementedError extends PikkuError {}
addError(NotImplementedError, {
  status: 501,
  message:
    'The server does not recognize the request method and cannot support it.',
})

/**
 * An upstream service returned an invalid response. Answers 502.
 * @group Error
 */
export class BadGatewayError extends PikkuError {}
addError(BadGatewayError, {
  status: 502,
  message:
    'The server was acting as a gateway or proxy and received an invalid response from the upstream server.',
})

/**
 * The service is temporarily unavailable (overloaded or down). Answers 503.
 * @group Error
 */
export class ServiceUnavailableError extends PikkuError {}
addError(ServiceUnavailableError, {
  status: 503,
  message: 'The server is currently unavailable (overloaded or down).',
})

/**
 * An upstream service did not answer in time. Answers 504.
 * @group Error
 */
export class GatewayTimeoutError extends PikkuError {}
addError(GatewayTimeoutError, {
  status: 504,
  message:
    'The server was acting as a gateway or proxy and did not receive a timely response from the upstream server.',
})

/**
 * The request's HTTP version is not supported. Answers 505.
 * @group Error
 */
export class HTTPVersionNotSupportedError extends PikkuError {}
addError(HTTPVersionNotSupportedError, {
  status: 505,
  message:
    'The server does not support the HTTP protocol version used in the request.',
})

/**
 * The function ran past the maximum compute time the runtime allows. Answers
 * 524.
 * @group Error
 */
export class MaxComputeTimeReachedError extends PikkuError {}
addError(MaxComputeTimeReachedError, {
  status: 524,
  message:
    'The server took too long to complete the request, reaching the maximum compute time allowed.',
})

/**
 * Validation was asked for a schema that was never registered, usually because
 * schema generation has not been run. Answers 500.
 * @group Error
 */
export class MissingSchemaError extends PikkuError {}
addError(MissingSchemaError, {
  status: 500,
  message:
    'A required schema was not found. Ensure schema generation has been run.',
})

/**
 * A configured secret is too short to be used as key material. Thrown at
 * startup or first use rather than letting a guessable key sign or encrypt
 * anything. Answers 500.
 * @group Error
 */
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

/**
 * An agent was run without any AI provider service configured. Answers 503.
 * @group Error
 */
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

/**
 * The model answered, but not with what the agent's output schema promises.
 * A 502 rather than a 422: the bad content came from the model, not from the
 * caller, and resending the same request is the only remedy the caller has.
 * @group Error
 */
export class AgentOutputValidationError extends PikkuError {
  constructor(
    public readonly agentName: string | undefined,
    public readonly issues: readonly string[]
  ) {
    super(
      `${agentName ? `Agent '${agentName}'` : 'The model'} returned output that does not match its output schema: ${issues.join('; ')}`
    )
  }
}
addError(AgentOutputValidationError, {
  status: 502,
  message:
    "The AI model returned output that does not match the agent's output schema.",
})

/**
 * The configured AI provider rejected its API key, or none was set. Answers
 * 401.
 * @group Error
 */
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
 * what a declared virtual user means, and what every scenario written against that
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
