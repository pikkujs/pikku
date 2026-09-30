/**
 * Operator/agent-supplied auth configuration that overrides or augments an
 * OpenAPI spec's securitySchemes. Needed for real-world enterprise specs that
 * carry no machine-readable auth at all (auth described only in prose), or
 * that use a custom auth header the spec doesn't declare.
 */
import { readFile } from 'fs/promises'
import { z } from 'zod'

export const DelegatedClaimsSchema = z.object({
  /**
   * Where identity claims live: the decoded login-JWT payload, the login
   * response body, or the `identity` lookup's response. Defaults to
   * `identity` when an identity lookup is configured, else `response`.
   */
  source: z.enum(['jwt', 'response', 'identity']).optional(),
  /** Dot-path to the stable upstream user id (e.g. 'user._id'). Defaults to the sign-in login. */
  externalId: z.string().optional(),
  /** Dot-path to the email; when missing or empty, `emailTemplate` builds one. */
  email: z.string().optional(),
  /** One dot-path, or several joined with a space (e.g. first + last name). Defaults to the login. */
  name: z.union([z.string(), z.array(z.string())]).optional(),
  role: z.string().optional(),
  tenantId: z.string().optional(),
})

export const DelegatedLoginSchema = z.object({
  /** Spec-relative path of the login operation (e.g. '/users/login'). */
  loginPath: z.string(),
  loginMethod: z.string().default('post'),
  /**
   * Which credentials the sign-in form collects. `login` is a username or
   * email, `email` an email address, `apiKey` a key sent in `apiKeyHeader`.
   */
  credentials: z
    .array(z.enum(['login', 'email', 'password', 'apiKey']))
    .default(['email', 'password']),
  /**
   * Upstream field name for each credential, e.g. `{ "login": "username" }`.
   * Unmapped credentials keep their own name.
   */
  fields: z
    .partialRecord(z.enum(['login', 'email', 'password']), z.string())
    .optional(),
  /** How the login fields travel: a JSON body, a form body, or the query string. */
  encoding: z.enum(['json', 'form', 'query']).default('json'),
  /** Header carrying the apiKey when 'apiKey' is a supported credential. */
  apiKeyHeader: z.string().default('x-api-key'),
  /** Dot-path to the token in the login response (e.g. 'token'). */
  tokenPath: z.string(),
  /** Dot-path to an epoch-seconds expiry in the response; defaults to the JWT `exp` claim when source is jwt. */
  expiresAtPath: z.string().optional(),
  /**
   * An operation that returns the signed-in user, called with the new token
   * in the auth header — for upstreams whose login returns only a token.
   */
  identity: z
    .object({
      path: z.string(),
      method: z.string().default('get'),
    })
    .optional(),
  claims: DelegatedClaimsSchema.default({}),
  /**
   * Builds the user's email when the upstream has none. Placeholders:
   * `{login}`, `{externalId}`, `{host}` (the upstream's host).
   */
  emailTemplate: z.string().default('{login}@{host}'),
  /** Maps the raw `claims.role` value onto an app role; unmapped values get no role. */
  roles: z.record(z.string(), z.string()).optional(),
})

export const AuthConfigSchema = z.object({
  /** Auth header the API expects on authenticated calls (e.g. 'authentication'). Overrides the spec. */
  headerName: z.string().optional(),
  /** 'raw' sends the bare token; 'bearer' prefixes it. Default: bearer for Authorization, raw for custom headers. */
  headerFormat: z.enum(['raw', 'bearer']).optional(),
  /**
   * Static headers sent on EVERY request — the delegated login call and all
   * proxied API calls. Needed for upstreams that route on a header, e.g. a
   * multi-tenant API that resolves the tenant from an `Origin` header and
   * rejects requests without it.
   */
  extraHeaders: z.record(z.string(), z.string()).optional(),
  /** Present when end-users sign in with their existing upstream credentials (delegated login). */
  delegated: DelegatedLoginSchema.optional(),
})

export type DelegatedLoginConfig = z.infer<typeof DelegatedLoginSchema>
export type AuthConfig = z.infer<typeof AuthConfigSchema>

/** The effective value template for the auth header. */
export const authHeaderValue = (
  config: AuthConfig,
  tokenExpr: string
): { header: string; value: string } => {
  const header = config.headerName ?? 'Authorization'
  const format =
    config.headerFormat ??
    (config.headerName && config.headerName !== 'Authorization'
      ? 'raw'
      : 'bearer')
  return {
    header,
    value: format === 'bearer' ? `\`Bearer \${${tokenExpr}}\`` : tokenExpr,
  }
}

/** Load and validate an auth-config JSON file; throws with the zod issue list on mismatch. */
export async function loadAuthConfig(filePath: string): Promise<AuthConfig> {
  const raw = await readFile(filePath, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Auth config ${filePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const result = AuthConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Auth config ${filePath} is invalid:\n${issues}`)
  }
  return result.data
}
