import { pikkuConfig, pikkuServices } from '#pikku'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { VERIFIER_OAUTH_PROVIDERS } from './providers.js'
import { PROVIDER_REGISTRY, type AuthProviderDef } from '@pikku/better-auth'

export const createConfig = pikkuConfig(async () => ({}))

const VARIABLE_VALUES: Record<string, string> = {
  MICROSOFT_TENANT_ID: 'common',
  COGNITO_DOMAIN: 'fake.auth.us-east-1.amazoncognito.com',
  COGNITO_REGION: 'us-east-1',
  COGNITO_USER_POOL_ID: 'us-east-1_fake',
}

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables = existingServices?.variables ?? new LocalVariablesService()
    const secrets =
      existingServices?.secrets ?? new LocalSecretService(variables)
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)

    // better-auth's session-signing secret.
    await secrets.setSecret(
      'BETTER_AUTH_SECRET',
      'verifier-better-auth-secret-key-32ch!'
    )

    for (const provider of VERIFIER_OAUTH_PROVIDERS) {
      const def = PROVIDER_REGISTRY[provider] as AuthProviderDef | undefined
      if (!def) continue
      await secrets.setSecret(def.secretId, {
        clientId: `fake-${provider}-client-id`,
        clientSecret: `fake-${provider}-client-secret`,
      })
      if (def.variables) {
        for (const meta of Object.values(def.variables)) {
          variables.set(
            meta.variableId,
            VARIABLE_VALUES[meta.variableId] ?? 'fake-value'
          )
        }
      }
    }

    return { config, secrets, logger, variables, schema }
  }
)
