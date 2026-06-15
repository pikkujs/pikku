import { pikkuConfig, pikkuServices } from '#pikku'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { ALL_OAUTH_PROVIDERS } from './providers.js'
import { PROVIDER_REGISTRY, type AuthProviderDef } from '@pikku/auth-js'

export const createConfig = pikkuConfig(async () => ({}))

const ISSUER_VARIABLES: Record<string, string> = {
  auth0: 'https://fake-tenant.auth0.com',
  okta: 'https://fake.okta.com',
  'microsoft-entra-id': 'fake-tenant-id',
  keycloak: 'https://fake.keycloak.example.com/realms/test',
  cognito: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_fake',
}

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables = existingServices?.variables ?? new LocalVariablesService()
    const secrets =
      existingServices?.secrets ?? new LocalSecretService(variables)
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)

    await secrets.setSecret('AUTH_SECRET', 'verifier-auth-js-secret-key-32ch!')

    for (const provider of ALL_OAUTH_PROVIDERS) {
      const def = PROVIDER_REGISTRY[provider] as AuthProviderDef | undefined
      if (!def) continue
      await secrets.setSecret(def.secretId, {
        clientId: `fake-${provider}-client-id`,
        clientSecret: `fake-${provider}-client-secret`,
      })
      if (def.variables) {
        for (const [field, meta] of Object.entries(def.variables)) {
          const value = ISSUER_VARIABLES[provider] ?? `fake-${field}-value`
          variables.set(meta.variableId, value)
        }
      }
    }

    return { config, secrets, logger, variables, schema }
  }
)
