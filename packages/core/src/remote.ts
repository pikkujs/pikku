import type { JWTService } from './services/jwt-service.js'
import type { SecretService } from './services/secret-service.js'
import { encryptJSON } from './crypto-utils.js'

/**
 * Build Authorization headers with JWT-signed session and traceId for
 * pikkuRemoteAuthMiddleware on the receiving end.
 *
 * Used by all deployment services (Kysely, Redis, MongoDB, Lambda, CF, Azure)
 * regardless of transport (HTTP, Lambda Invoke, service bindings).
 */
export async function buildRemoteHeaders(
  jwt: JWTService | undefined,
  secrets: SecretService | undefined,
  funcName: string,
  session?: unknown,
  traceId?: string
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(traceId && { 'x-request-id': traceId }),
  }

  let secret: string | undefined
  try {
    secret = await secrets?.getSecret('PIKKU_REMOTE_SECRET')
  } catch {}

  if (secret && jwt) {
    const sessionEnc = session
      ? await encryptJSON(secret, { session })
      : undefined
    const token = await jwt.encode(
      { value: 5, unit: 'minute' },
      {
        aud: 'pikku-remote',
        fn: funcName,
        iat: Math.floor(Date.now() / 1000),
        session: sessionEnc,
      }
    )
    headers.authorization = `Bearer ${token}`
  }

  return headers
}
