import {
  pikkuConfig,
  pikkuServices,
  pikkuSessionServices,
} from '../.pikku/pikku-types.gen.js'
import { LocalVariablesService } from '@pikku/core/services'
import { CustomLogger } from './services/custom-logger.service.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

export const createSingletonServices = pikkuServices(async (config) => {
  const logger = new CustomLogger()

  return {
    variables: new LocalVariablesService(),
    config,
    logger,
  }
})

export const createSessionServices = pikkuSessionServices(
  async (_services, interaction, _session) => {
    return {
      mcp: interaction.mcp,
      channel: interaction.channel,
    } as any
  }
)
