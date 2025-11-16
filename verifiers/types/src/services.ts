import type {
  Config,
  Services,
  SingletonServices,
  UserSession,
} from '../types/application-types.js'
import {
  CreateConfig,
  CreateSessionServices,
  CreateSingletonServices,
} from '@pikku/core'
import { ConsoleLogger, LocalVariablesService } from '@pikku/core/services'

import '../.pikku/pikku-bootstrap.gen.js'

export const createConfig: CreateConfig<Config> = async () => {
  return {} as Config
}

export const createSingletonServices: CreateSingletonServices<
  Config,
  SingletonServices
> = async (config) => {
  const variables = new LocalVariablesService()

  return {
    config,
    logger: new ConsoleLogger(),
    variables,
  }
}

export const createSessionServices: CreateSessionServices<
  SingletonServices,
  Services,
  UserSession
> = async ({ logger }) => {
  return {} as Services
}
