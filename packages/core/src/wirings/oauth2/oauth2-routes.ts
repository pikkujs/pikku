import { defineHTTPRoutes } from '../http/http-routes.js'
import type { HTTPRouteContract, HTTPRouteMap } from '../http/http.types.js'
import { pikkuState } from '../../pikku-state.js'
import { OAuth2Client } from './oauth2-client.js'
import type { CredentialService } from '../../services/credential-service.js'
import type { SecretService } from '../../services/secret-service.js'
import type { JWTService } from '../../services/jwt-service.js'
import type { CredentialDefinitionsMeta } from '../credential/credential.types.js'
import type { OAuth2Token } from './oauth2.types.js'

const TOKEN_EXPIRY_BUFFER_MS = 60_000

export type CreateOAuth2RoutesOptions = {
  credentialsMeta: CredentialDefinitionsMeta
  basePath?: string
}

type OAuth2RouteContext = {
  credentialsMeta: CredentialDefinitionsMeta
}

const OAUTH2_ROUTES = [
  { method: 'get' as const, route: '/:name/connect', sessionless: false },
  { method: 'get' as const, route: '/:name/callback', sessionless: true },
  { method: 'delete' as const, route: '/:name', sessionless: false },
  { method: 'get' as const, route: '/:name/status', sessionless: false },
]

function registerOAuth2Meta(basePath: string): void {
  const httpMeta = pikkuState(null, 'http', 'meta')
  const funcMeta = pikkuState(null, 'function', 'meta')

  const httpMiddlewareGroups = pikkuState(null, 'middleware', 'httpGroup')
  const middleware: Array<{ type: 'http'; route: string }> = []
  for (const pattern of Object.keys(httpMiddlewareGroups)) {
    middleware.push({ type: 'http', route: pattern })
  }

  for (const { method, route, sessionless } of OAUTH2_ROUTES) {
    const fullRoute = basePath + route
    const pikkuFuncId = `oauth2_${method}_${fullRoute.replace(/[^a-z0-9]/gi, '_')}`

    if (!httpMeta[method]) {
      httpMeta[method] = {}
    }
    httpMeta[method][fullRoute] = {
      pikkuFuncId,
      route: fullRoute,
      method,
      middleware,
    }

    funcMeta[pikkuFuncId] = {
      pikkuFuncId,
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless,
      services: { optimized: false, services: [] },
    }
  }
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
 * Creates OAuth2 routes for user credential management.
 *
 * Provides connect/callback/disconnect/status endpoints that handle
 * the OAuth2 authorization code flow and store tokens in CredentialService.
 *
 * @example
 * ```typescript
 * wireHTTPRoutes({
 *   routes: {
 *     credentials: createOAuth2Routes({
 *       credentialsMeta,
 *     }),
 *   },
 * })
 * ```
 */
export const createOAuth2Routes = (
  options: CreateOAuth2RoutesOptions
): HTTPRouteContract<HTTPRouteMap> => {
  const basePath = options.basePath ?? '/credentials'
  const ctx: OAuth2RouteContext = {
    credentialsMeta: options.credentialsMeta,
  }

  registerOAuth2Meta(basePath)

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

  return defineHTTPRoutes({
    auth: true,
    basePath,
    routes: {
      connect: {
        method: 'get',
        route: '/:name/connect',
        func: { func: connectHandler } as any,
      },
      callback: {
        method: 'get',
        route: '/:name/callback',
        func: { func: callbackHandler } as any,
        auth: false,
      },
      disconnect: {
        method: 'delete',
        route: '/:name',
        func: { func: disconnectHandler } as any,
      },
      status: {
        method: 'get',
        route: '/:name/status',
        func: { func: statusHandler } as any,
      },
    },
  })
}
