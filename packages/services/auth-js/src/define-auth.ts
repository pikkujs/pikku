import { rpcService } from '@pikku/core/rpc'
import { setAuthRegistry } from '@pikku/core'
import type { AuthConfig } from '@auth/core'
import type { CoreSingletonServices, PikkuWire } from '@pikku/core'
import type { SecretService, VariablesService } from '@pikku/core/services'
import type { AuthConfigOrFactory } from './auth-handler.js'
import { PROVIDER_REGISTRY } from './provider-registry.js'

export type AuthProvider = keyof typeof PROVIDER_REGISTRY

export interface DefinedAuthProviderMeta {
  id: string
  displayName: string
  secretId: string
}

/** Factory invoked once per request: receives the singleton services and a
 *  request-scoped `rpc` handle, returns Auth.js's native `callbacks` object
 *  (fully typed — `jwt`, `session`, `redirect`, `signIn`, ...). Hoisting the
 *  injection here keeps each callback body Auth.js-native and gives it access
 *  to `services` (which a per-call `(rpc, data)` shape could not). */
export type DefineAuthCallbacks = (
  services: CoreSingletonServices,
  rpc: any
) => NonNullable<AuthConfig['callbacks']>

export interface DefineAuthCredentials {
  fields?: Record<
    string,
    { label?: string; type?: string; placeholder?: string; required?: boolean }
  >
  /** Factory invoked once per request with `(services, rpc)`, returning the
   *  Auth.js `authorize` fn. Same injection shape as {@link DefineAuthCallbacks}. */
  authorize: (
    services: CoreSingletonServices,
    rpc: any
  ) => (credentials: Record<string, unknown>) => Promise<any>
}

export interface DefineAuthOptions {
  providers?: AuthProvider[]
  credentials?: DefineAuthCredentials
  callbacks?: DefineAuthCallbacks
  basePath?: string
}

/**
 * The value `defineAuth` returns. It has NO side effects — the user exports it
 * (`export const auth = defineAuth({...})`) and the pikku CLI generates the
 * `/auth/*` HTTP wiring from it (see serializeAuthGen). `configFactory` is what
 * `createAuthHandler` consumes at request time.
 */
export interface DefinedAuth {
  configFactory: AuthConfigOrFactory
  basePath: string
  providers: DefinedAuthProviderMeta[]
  hasCredentials: boolean
}

async function batchLoadSecrets(
  secrets: SecretService,
  keys: string[]
): Promise<Map<string, unknown>> {
  const map = await secrets.getSecrets(keys)
  return new Map(Object.entries(map))
}

async function buildCredentialsProvider(
  credentials: DefineAuthCredentials,
  services: CoreSingletonServices,
  rpc: any
): Promise<any | null> {
  try {
    const mod = await import('@auth/core/providers/credentials')
    const CredentialsFn = (mod as any).default ?? (mod as any).Credentials
    if (!CredentialsFn) return null
    const authorize = credentials.authorize(services, rpc)
    return CredentialsFn({
      ...(credentials.fields ? { credentials: credentials.fields } : {}),
      authorize: (creds: any) => authorize(creds),
    })
  } catch {
    return null
  }
}

async function buildProviders(
  providers: string[],
  secretsMap: Map<string, unknown>,
  variables: VariablesService
): Promise<any[]> {
  const instances: any[] = []
  for (const name of providers) {
    const def = PROVIDER_REGISTRY[name]
    if (!def) continue
    const creds = secretsMap.get(def.secretId) as
      | Record<string, string>
      | undefined
    if (!creds) continue
    const config: Record<string, unknown> = { ...creds }
    if (def.variables) {
      for (const [field, meta] of Object.entries(def.variables) as [
        string,
        { variableId: string },
      ][]) {
        const value = await variables.get(meta.variableId)
        if (value !== undefined) config[field] = value
      }
    }
    try {
      const mod = await import(def.importPath)
      const ctor = mod.default ?? mod[def.importName]
      if (ctor) instances.push(ctor(config))
    } catch {
      // provider package not installed — skip
    }
  }
  return instances
}

/**
 * Declare an Auth.js configuration. Unlike a `wire*` helper, this has NO side
 * effects: it returns a {@link DefinedAuth} that the project exports
 * (`export const auth = defineAuth({...})`). The pikku CLI discovers that single
 * export and generates the explicit `/auth/*` HTTP routes from it — so the auth
 * routes flow through normal inspection (and into the deploy manifest) like any
 * other route, instead of being registered via a hidden runtime side-channel.
 *
 * Exactly one `defineAuth` is allowed per codebase (the CLI errors otherwise).
 */
export const defineAuth = (options: DefineAuthOptions): DefinedAuth => {
  const { providers = [], credentials, callbacks, basePath = '/auth' } = options

  const secretIds = [
    'AUTH_SECRET',
    ...providers
      .map((p) => PROVIDER_REGISTRY[p]?.secretId)
      .filter((id): id is string => Boolean(id)),
  ]

  const configFactory: AuthConfigOrFactory = async (
    services: CoreSingletonServices
  ) => {
    const secretsMap = await batchLoadSecrets(services.secrets, secretIds)
    const authSecret = secretsMap.get('AUTH_SECRET') as string | undefined
    // A missing AUTH_SECRET must fail loudly — never sign sessions with an
    // absent/empty key. Defaulting here would be a silent security hazard.
    if (!authSecret) {
      throw new Error(
        'AUTH_SECRET is not set — Auth.js cannot sign sessions without it. Configure the AUTH_SECRET secret for this stage.'
      )
    }

    const wire: PikkuWire = { wireType: 'http' }
    const rpc = rpcService.getContextRPCService(services, wire, {
      requiresAuth: false,
    })

    const providerInstances = await buildProviders(
      providers,
      secretsMap,
      services.variables
    )

    if (credentials) {
      const credProvider = await buildCredentialsProvider(
        credentials,
        services,
        rpc
      )
      if (credProvider) providerInstances.push(credProvider)
    }

    const callbackFns = callbacks ? callbacks(services, rpc) : undefined

    return {
      providers: providerInstances,
      secret: authSecret,
      trustHost: true,
      basePath,
      ...(callbackFns ? { callbacks: callbackFns } : {}),
    }
  }

  const resolvedProviders = providers
    .filter((p) => PROVIDER_REGISTRY[p])
    .map((p) => {
      const def = PROVIDER_REGISTRY[p]
      return { id: p, displayName: def.displayName, secretId: def.secretId }
    })

  setAuthRegistry({
    providers: resolvedProviders,
    hasCredentials: !!credentials,
  })

  return {
    configFactory,
    basePath,
    providers: resolvedProviders,
    hasCredentials: !!credentials,
  }
}
