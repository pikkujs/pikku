import type {
  Config,
  Services,
  SingletonServices,
  UserSession,
} from './types/application-types.d.js'
import {
  CreateConfig,
  CreateSessionServices,
  CreateSingletonServices,
} from '@pikku/core'
import { LocalVariablesService } from '@pikku/core/services'
import { CustomLogger } from './services/custom-logger.service.js'
import { RequiredSingletonServices } from '../.pikku/pikku-services.gen.js'

export const createConfig: CreateConfig<Config> = async () => {
  return {}
}

export const createSingletonServices: CreateSingletonServices<
  Config,
  RequiredSingletonServices
> = async (config: Config): Promise<RequiredSingletonServices> => {
  const logger = new CustomLogger()

  return {
    variables: new LocalVariablesService(),
    config,
    logger,
  }
}

export const createSessionServices: CreateSessionServices<
  SingletonServices,
  Services,
  UserSession
> = async (_services, _interaction, _session) => {
  return {}
}
