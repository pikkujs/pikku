import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

/**
 * How to authenticate the request. Carries only NAMES and static constants — the
 * secret value is resolved from the SecretService at request time, never passed
 * in as data (so it is never persisted to workflow step state).
 */
export const HttpAuth = z.object({
  mode: z
    .enum(['bearer', 'apiKeyHeader', 'apiKeyQuery', 'basic', 'oauth2'])
    .describe('How the credential is applied to the request'),
  credential: z.string().describe('Secret key the value is provisioned under'),
  headerName: z
    .string()
    .optional()
    .describe('apiKeyHeader — header name (defaults to Authorization)'),
  queryName: z
    .string()
    .optional()
    .describe('apiKeyQuery — query-param name (defaults to api_key)'),
  extraHeaders: z
    .record(z.string(), z.string())
    .optional()
    .describe('Static, non-secret headers always sent (e.g. Notion-Version)'),
  source: z
    .enum(['secret', 'credential'])
    .optional()
    .describe('Where the value comes from — secret (default) or credential'),
})

export const HttpRequestInput = z.object({
  method: z
    .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
    .default('GET')
    .describe('HTTP method'),
  url: z.string().describe('The request URL'),
  headers: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Request headers'),
  query: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Query string parameters appended to the URL'),
  body: z
    .unknown()
    .optional()
    .describe('Request body — JSON-encoded unless it is already a string'),
  auth: HttpAuth.optional().describe(
    'Optional authentication resolved from a secret at request time'
  ),
})

/**
 * The parsed response body, exposed directly as the output so downstream graph
 * nodes can reference its fields. A non-object response (array, string, number)
 * is wrapped under `data`.
 */
export const HttpRequestOutput = z
  .record(z.string(), z.unknown())
  .describe('Parsed JSON response body')

/**
 * Resolve a secret value, wrapping a missing-secret failure with a message that
 * names the credential — turning "empty value" into an actionable "provision
 * secret X" for an imported workflow.
 */
async function resolveSecret(
  secrets: { getSecret: (key: string) => Promise<string> },
  credential: string
): Promise<string> {
  try {
    return await secrets.getSecret(credential)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new Error(
      `httpRequest auth: could not resolve secret "${credential}" — provision it before running this workflow (${reason})`
    )
  }
}

export const httpRequest = pikkuSessionlessFunc({
  description: 'Perform an HTTP request and return the response body',
  node: { displayName: 'HTTP Request', category: 'Data', type: 'action' },
  input: HttpRequestInput,
  output: HttpRequestOutput,
  func: async ({ secrets }, data) => {
    const url = new URL(data.url)
    for (const [key, value] of Object.entries(data.query ?? {})) {
      url.searchParams.set(key, String(value))
    }

    const sendsBody =
      data.body !== undefined && data.method !== 'GET' && data.method !== 'HEAD'
    const bodyIsString = typeof data.body === 'string'

    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(data.headers ?? {})) {
      headers[key] = String(value)
    }
    if (sendsBody && !bodyIsString && !('content-type' in headers)) {
      headers['content-type'] = 'application/json'
    }

    const auth = data.auth
    if (auth) {
      if (auth.mode === 'oauth2') {
        throw new Error(
          'httpRequest auth: OAuth2 is not yet supported (needs provider config + token flow)'
        )
      }
      // Static, non-secret headers first — an explicit request header wins.
      for (const [key, value] of Object.entries(auth.extraHeaders ?? {})) {
        if (!(key in headers)) headers[key] = value
      }
      const secret = await resolveSecret(secrets, auth.credential)
      switch (auth.mode) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${secret}`
          break
        case 'apiKeyHeader':
          headers[auth.headerName ?? 'Authorization'] = secret
          break
        case 'apiKeyQuery':
          url.searchParams.set(auth.queryName ?? 'api_key', secret)
          break
        case 'basic':
          headers['Authorization'] =
            `Basic ${Buffer.from(secret).toString('base64')}`
          break
      }
    }

    const response = await fetch(url, {
      method: data.method,
      headers,
      body: sendsBody
        ? bodyIsString
          ? (data.body as string)
          : JSON.stringify(data.body)
        : undefined,
    })

    const text = await response.text()
    let parsed: unknown = text
    try {
      parsed = JSON.parse(text)
    } catch {
      // not JSON — keep the raw text
    }

    return parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { data: parsed }
  },
})
