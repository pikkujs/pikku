import { LocalVariablesService, LocalSecretService } from '@pikku/core/services'
import { createSingletonServices } from '../../functions/src/services.js'
import { createConfig } from '../../functions/src/config.js'

export const setupServices = async (
  env: Record<string, string | undefined>
) => {
  const localVariables = new LocalVariablesService(env)
  const config = await createConfig(localVariables)
  const localSecrets = new LocalSecretService(localVariables)
  return await createSingletonServices(config, {
    variables: localVariables,
    secrets: localSecrets,
  })
}
