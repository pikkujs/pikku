import { wireHTTPRoutes } from '@pikku/core/http'
import { rpcService } from '@pikku/core/rpc'
import type { CoreSingletonServices, PikkuWire } from '@pikku/core'
import type { SecretService } from '@pikku/core/services'
import { createAuthRoutes } from './auth-routes.js'
import { PROVIDER_REGISTRY } from './provider-registry.js'

export type AuthProvider = keyof typeof PROVIDER_REGISTRY

export type WireAuthCallbacks = {
  signIn?: (rpc: any, data: any) => any
  signOut?: (rpc: any, data: any) => any
  redirect?: (rpc: any, data: any) => any
  session?: (rpc: any, data: any) => any
  jwt?: (rpc: any, data: any) => any
  authorized?: (rpc: any, data: any) => any
}

export interface WireAuthOptions {
  providers: (AuthProvider | string)[]
  callbacks?: WireAuthCallbacks
  basePath?: string
}

async function batchLoadSecrets(
  secrets: SecretService,
  keys: string[]
): Promise<Map<string, unknown>> {
  const map = await secrets.getSecrets(keys)
  return new Map(Object.entries(map))
}

async function buildProviders(
  providers: string[],
  secretsMap: Map<string, unknown>
): Promise<any[]> {
  const instances: any[] = []
  for (const name of providers) {
    const def = PROVIDER_REGISTRY[name]
    if (!def) continue
    const creds = secretsMap.get(def.secretId) as
      | Record<string, string>
      | undefined
    if (!creds) continue
    try {
      const mod = await import(def.importPath)
      const ctor = mod.default ?? mod[def.importName]
      if (ctor) instances.push(ctor(creds))
    } catch {
      // provider package not installed — skip
    }
  }
  return instances
}

export const wireAuth = (options: WireAuthOptions): void => {
  const { providers, callbacks = {}, basePath = '/auth' } = options

  const secretIds = [
    'AUTH_SECRET',
    ...providers
      .map((p) => PROVIDER_REGISTRY[p]?.secretId)
      .filter((id): id is string => Boolean(id)),
  ]

  const authRoutes = createAuthRoutes(
    async (services: CoreSingletonServices) => {
      const secretsMap = await batchLoadSecrets(services.secrets, secretIds)
      const authSecret = secretsMap.get('AUTH_SECRET') as string | undefined

      const wire: PikkuWire = { wireType: 'http' }
      const rpc = rpcService.getContextRPCService(services, wire, {
        requiresAuth: false,
      })

      const providerInstances = await buildProviders(providers, secretsMap)

      const wrappedCallbacks: Record<string, (data: any) => any> = {}
      for (const [key, cb] of Object.entries(callbacks)) {
        if (cb) {
          wrappedCallbacks[key] = (data: any) => (cb as any)(rpc, data)
        }
      }

      return {
        providers: providerInstances,
        secret: authSecret,
        trustHost: true,
        basePath,
        ...(Object.keys(wrappedCallbacks).length > 0
          ? { callbacks: wrappedCallbacks }
          : {}),
      }
    },
    basePath
  )

  wireHTTPRoutes({ routes: { auth: authRoutes } })
}
