import type { JWTService } from './services/jwt-service.js'
import type { SecretService } from './services/secret-service.js'
import {
  assertStrongKeyMaterial,
  encryptWithKeyMaterial,
  REMOTE_SESSION_INFO,
} from './crypto-utils.js'

/**
 * An unset secret means remote auth is not configured, so the call goes out
 * unauthenticated. A secrets backend that fails is a different thing: sending
 * the call anyway would only earn a 401 from the peer with no hint why.
 */
const readRemoteSecret = async (
  secrets: SecretService | undefined
): Promise<string | undefined> => {
  if (!secrets) {
    return undefined
  }
  try {
    if (!(await secrets.hasSecret('PIKKU_REMOTE_SECRET'))) {
      return undefined
    }
    return (await secrets.getSecret('PIKKU_REMOTE_SECRET')).reveal()
  } catch (cause) {
    throw new Error(
      'Could not read PIKKU_REMOTE_SECRET from the secrets service; refusing to send an unauthenticated remote call',
      { cause }
    )
  }
}

/**
 * Authorization headers carrying a JWT-signed session and traceId for
 * `pikkuRemoteAuthMiddleware` on the receiving end. Used by every deployment
 * service regardless of transport (HTTP, Lambda Invoke, service bindings).
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

  const secret = await readRemoteSecret(secrets)

  if (secret && jwt) {
    assertStrongKeyMaterial('PIKKU_REMOTE_SECRET', secret)
    const sessionEnc = session
      ? await encryptWithKeyMaterial(
          'PIKKU_REMOTE_SECRET',
          secret,
          REMOTE_SESSION_INFO,
          {
            session,
          }
        )
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
