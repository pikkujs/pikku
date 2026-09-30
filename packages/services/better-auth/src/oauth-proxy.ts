import { betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { oAuthProxy } from 'better-auth/plugins'
import type { CoreSingletonServices } from '@pikku/core/types'
import type { BetterAuthInstance } from './define-auth.js'
import { PROVIDER_REGISTRY } from './provider-registry.js'

export const OAUTH_PROXY_SECRET_ID = 'OAUTH_PROXY_SECRET'
export const OAUTH_PROXY_URL_VARIABLE = 'OAUTH_PROXY_URL'
export const OAUTH_PROXY_KEY_ID_VARIABLE = 'OAUTH_PROXY_KEY_ID'
export const OAUTH_PROXY_PROVIDERS_VARIABLE = 'OAUTH_PROXY_PROVIDERS'

/** Providers a host may proxy. Each needs its `<ID>_OAUTH` secret declared. */
export const OAUTH_PROXY_PROVIDER_IDS = ['google', 'github'] as const

/**
 * The client secret handed to a provider that signs in through the proxy. The
 * real one never leaves the proxy; better-auth only insists the field is set.
 */
const PLACEHOLDER_CLIENT_SECRET = 'oauth-proxy'

type ProxyServices = Pick<CoreSingletonServices, 'logger'> & {
  secrets?: { getSecret(id: string): Promise<{ reveal(): unknown }> }
  variables?: { get(id: string): Promise<string | undefined | null> }
}

export interface OAuthProxyConfig {
  productionURL: string
  secret: string
  keyId: string | undefined
  providers: Record<string, { clientId: string; clientSecret: string }>
}

const readSecret = async (
  services: ProxyServices,
  id: string
): Promise<unknown> => {
  try {
    return (await services.secrets?.getSecret(id))?.reveal()
  } catch {
    return undefined
  }
}

const readVariable = async (
  services: ProxyServices,
  id: string
): Promise<string | undefined> => {
  try {
    return (await services.variables?.get(id)) || undefined
  } catch {
    return undefined
  }
}

const parseProviders = (raw: string): string[] =>
  raw
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean)

/**
 * Reads the proxy configuration a host injects into the stage, or null when none
 * of it is present. All-or-nothing: a stage with some of it set is a broken
 * deploy, and a sign-in button that silently does nothing is worse than a boot
 * failure that names what is missing.
 */
export const resolveOAuthProxyConfig = async (
  services: ProxyServices
): Promise<OAuthProxyConfig | null> => {
  const secret = await readSecret(services, OAUTH_PROXY_SECRET_ID)
  const productionURL = await readVariable(services, OAUTH_PROXY_URL_VARIABLE)
  const providerList = await readVariable(
    services,
    OAUTH_PROXY_PROVIDERS_VARIABLE
  )
  const keyId = await readVariable(services, OAUTH_PROXY_KEY_ID_VARIABLE)

  if (!secret && !productionURL && !providerList) return null
  if (providerList?.trim().toLowerCase() === 'none') return null

  const missing = [
    typeof secret === 'string' && secret ? null : OAUTH_PROXY_SECRET_ID,
    productionURL ? null : OAUTH_PROXY_URL_VARIABLE,
    providerList ? null : OAUTH_PROXY_PROVIDERS_VARIABLE,
  ].filter(Boolean)
  if (missing.length) {
    throw new Error(
      `OAuth proxy is partly configured: ${missing.join(', ')} not set. Set ${OAUTH_PROXY_SECRET_ID}, ${OAUTH_PROXY_URL_VARIABLE} and ${OAUTH_PROXY_PROVIDERS_VARIABLE} together, or none of them.`
    )
  }

  const providers: OAuthProxyConfig['providers'] = {}
  for (const id of parseProviders(providerList!)) {
    const def = (PROVIDER_REGISTRY as Record<string, { secretId: string }>)[id]
    if (!def) {
      throw new Error(
        `OAuth proxy: "${id}" in ${OAUTH_PROXY_PROVIDERS_VARIABLE} is not a known provider.`
      )
    }
    const credentials = (await readSecret(services, def.secretId)) as
      | { clientId?: string }
      | undefined
    if (!credentials?.clientId) {
      throw new Error(
        `OAuth proxy: ${id} is listed in ${OAUTH_PROXY_PROVIDERS_VARIABLE} but ${def.secretId} has no clientId.`
      )
    }
    providers[id] = {
      clientId: credentials.clientId,
      clientSecret: PLACEHOLDER_CLIENT_SECRET,
    }
  }

  return {
    productionURL: productionURL!,
    secret: secret as string,
    keyId,
    providers,
  }
}

const keyIdPrefix = (keyId: string) => ({
  id: 'oauth-proxy-key-id',
  hooks: {
    after: [
      {
        matcher: (context: { path?: string }) =>
          !!context.path?.startsWith('/sign-in/social') ||
          context.path === '/link-social',
        handler: createAuthMiddleware(async (ctx) => {
          const returned = ctx.context.returned
          if (!returned || typeof returned !== 'object' || !('url' in returned))
            return
          if (typeof returned.url !== 'string') return
          const url = new URL(returned.url)
          const state = url.searchParams.get('state')
          if (!state) return
          url.searchParams.set('state', `${keyId}.${state}`)
          ctx.context.returned = { ...returned, url: url.toString() }
        }),
      },
    ],
  },
})

/**
 * Turns on sign-in through a host's OAuth proxy when the stage carries its
 * configuration, and returns the instance unchanged when it does not.
 *
 * better-auth resolves its plugins and providers once, at construction, so the
 * proxy cannot be bolted onto a finished instance. The app's own options are
 * read back off it and a second instance is built from them with the proxy's
 * providers and plugins added.
 *
 * A provider the app already configures itself is a conflict, not an override:
 * the proxy plugin redirects every provider's callback to the proxy, which
 * would then try to exchange a code issued to the app's own credentials.
 */
export const applyOAuthProxy = async <I extends BetterAuthInstance>(
  instance: I,
  services: ProxyServices
): Promise<I> => {
  const config = await resolveOAuthProxyConfig(services)
  if (!config) return instance

  const options = (instance as any).options ?? {}
  const own = Object.keys(options.socialProviders ?? {}).filter((id) =>
    Object.hasOwn(config.providers, id)
  )
  if (own.length) {
    throw new Error(
      `OAuth proxy is on for ${own.join(', ')}, which the app also configures with its own credentials. Remove them from socialProviders, or remove ${own.join(', ')} from ${OAUTH_PROXY_PROVIDERS_VARIABLE}.`
    )
  }

  services.logger?.info(
    `pikku: OAuth sign-in for ${Object.keys(config.providers).join(', ')} goes through ${config.productionURL}.`
  )

  return betterAuth({
    ...options,
    socialProviders: { ...options.socialProviders, ...config.providers },
    plugins: [
      ...(options.plugins ?? []),
      oAuthProxy({
        productionURL: config.productionURL,
        secret: config.secret,
      }),
      ...(config.keyId ? [keyIdPrefix(config.keyId)] : []),
    ],
  }) as unknown as I
}
