import type { CredentialService } from '../../services/credential-service.js'
import type { SecretService } from '../../services/secret-service.js'
import type { JWTService } from '../../services/jwt-service.js'
import type { CredentialDefinitionsMeta } from '../credential/credential.types.js'
import type { OAuth2Token } from './oauth2.types.js'
import { OAuth2Client } from './oauth2-client.js'

const TOKEN_EXPIRY_BUFFER_MS = 60_000

export type CreateOAuth2HandlerOptions = {
  credentialsMeta: CredentialDefinitionsMeta
  basePath?: string
}

type OAuth2RouteContext = {
  credentialsMeta: CredentialDefinitionsMeta
  basePath: string
}

function getCredentialMeta(ctx: OAuth2RouteContext, name: string) {
  const meta = ctx.credentialsMeta[name]
  if (!meta) {
    throw new Error(`Credential '${name}' not found`)
  }
  if (!meta.oauth2) {
    throw new Error(`Credential '${name}' is not an OAuth2 credential`)
  }
  return meta
}

/**
 * Creates OAuth2 route handlers for user credential management.
 *
 * Returns individual handler functions for connect/callback/disconnect/status
 * that handle the OAuth2 authorization code flow and store tokens in CredentialService.
 *
 * @example
 * ```typescript
 * const oauth2 = createOAuth2Handler({ credentialsMeta })
 *
 * const oauth2Routes = defineHTTPRoutes({
 *   auth: true,
 *   basePath: '/credentials',
 *   routes: {
 *     connect: { method: 'get', route: '/:name/connect', func: oauth2.connect },
 *     callback: { method: 'get', route: '/:name/callback', func: oauth2.callback, auth: false },
 *     disconnect: { method: 'delete', route: '/:name', func: oauth2.disconnect },
 *     status: { method: 'get', route: '/:name/status', func: oauth2.status },
 *   },
 * })
 *
 * wireHTTPRoutes({ routes: { credentials: oauth2Routes } })
 * ```
 */
export const createOAuth2Handler = (options: CreateOAuth2HandlerOptions) => {
  const basePath = options.basePath ?? '/credentials'
  const ctx: OAuth2RouteContext = {
    credentialsMeta: options.credentialsMeta,
    basePath,
  }

  const connectHandler = async (
    services: {
      secrets: SecretService
      jwt: JWTService
      credentialService: CredentialService
    },
    _data: any,
    wire: any
  ) => {
    const { name } = wire.http.request.params()
    const meta = getCredentialMeta(ctx, name)
    const queryParams = wire.http.request.query()
    const redirectUrl = queryParams.redirect_url || queryParams.redirect

    const oauth2Client = new OAuth2Client(
      meta.oauth2!,
      meta.oauth2!.appCredentialSecretId,
      services.secrets
    )

    const userId = wire.session?.userId
    if (!userId) {
      throw new Error('Authentication required for OAuth2 connect')
    }

    const state = await services.jwt.encode(
      { value: 10, unit: 'minute' },
      {
        userId,
        credentialName: name,
        redirectUrl,
      }
    )

    let origin = wire.http.request.header('origin')
    if (!origin) {
      const host = wire.http.request.header('host')
      if (!host) {
        throw new Error(
          'Unable to determine request origin for OAuth2 callback'
        )
      }
      const protocol = wire.http.request.header('x-forwarded-proto') || 'http'
      origin = `${protocol}://${host}`
    }
    const callbackUrl = `${origin}${basePath}/${name}/callback`
    const authUrl = await oauth2Client.getAuthorizationUrl(state, callbackUrl)

    return Response.redirect(authUrl, 302)
  }

  const callbackHandler = async (
    services: {
      secrets: SecretService
      jwt: JWTService
      credentialService: CredentialService
      logger: any
    },
    _data: any,
    wire: any
  ) => {
    const { name } = wire.http.request.params()
    const meta = getCredentialMeta(ctx, name)
    const queryParams = wire.http.request.query()
    const code = queryParams.code as string | undefined
    const state = queryParams.state as string | undefined

    if (!code || !state) {
      throw new Error('Missing code or state parameter')
    }

    let statePayload: {
      userId: string
      credentialName: string
      redirectUrl?: string
    }
    try {
      statePayload = await services.jwt.decode(state)
    } catch {
      throw new Error('Invalid or expired OAuth2 state')
    }

    if (statePayload.credentialName !== name) {
      throw new Error('Credential name mismatch in state')
    }

    const oauth2Client = new OAuth2Client(
      meta.oauth2!,
      meta.oauth2!.appCredentialSecretId,
      services.secrets
    )

    let origin = wire.http.request.header('origin')
    if (!origin) {
      const host = wire.http.request.header('host')
      if (!host) {
        throw new Error(
          'Unable to determine request origin for OAuth2 callback'
        )
      }
      const protocol = wire.http.request.header('x-forwarded-proto') || 'http'
      origin = `${protocol}://${host}`
    }
    const callbackUrl = `${origin}${basePath}/${name}/callback`
    const tokens = await oauth2Client.exchangeCode(code, callbackUrl)

    await services.credentialService.set(name, tokens, statePayload.userId)

    services.logger.info(
      `OAuth2 tokens stored for user '${statePayload.userId}', credential '${name}'`
    )

    if (statePayload.redirectUrl) {
      return Response.redirect(statePayload.redirectUrl, 302)
    } else {
      return { success: true, credentialName: name }
    }
  }

  const disconnectHandler = async (
    services: { credentialService: CredentialService; logger: any },
    _data: any,
    wire: any
  ) => {
    const { name } = wire.http.request.params()
    const userId = wire.session?.userId
    if (!userId) {
      throw new Error('Authentication required')
    }
    await services.credentialService.delete(name, userId)
    services.logger.info(
      `OAuth2 credential '${name}' disconnected for user '${userId}'`
    )
    return { success: true }
  }

  const statusHandler = async (
    services: { credentialService: CredentialService },
    _data: any,
    wire: any
  ) => {
    const { name } = wire.http.request.params()
    const userId = wire.session?.userId
    if (!userId) {
      throw new Error('Authentication required')
    }

    const credential = await services.credentialService.get<OAuth2Token>(
      name,
      userId
    )

    if (!credential) {
      return { connected: false }
    }

    return {
      connected: true,
      hasRefreshToken: !!credential.refreshToken,
      expiresAt: credential.expiresAt,
      isExpired: credential.expiresAt
        ? credential.expiresAt < Date.now() + TOKEN_EXPIRY_BUFFER_MS
        : false,
    }
  }

  return {
    connect: { func: connectHandler } as any,
    callback: { func: callbackHandler } as any,
    disconnect: { func: disconnectHandler } as any,
    status: { func: statusHandler } as any,
  }
}
