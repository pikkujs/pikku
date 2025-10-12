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
import { ConsoleLogger, LocalVariablesService } from '@pikku/core/services'
import { MiddlewareChecker } from './services/middleware-checker.service.js'
import { RequiredSingletonServices } from '../.pikku/pikku-services.gen.js'

export const createConfig: CreateConfig<Config> = async () => {
  return {}
}

export const createSingletonServices: CreateSingletonServices<
  Config,
  RequiredSingletonServices
> = async (config: Config): Promise<RequiredSingletonServices> => {
  const logger = new ConsoleLogger()
  const middlewareChecker = new MiddlewareChecker()

  return {
    variables: new LocalVariablesService(),
    config,
    logger,
    middlewareChecker,
  }
}

export const createSessionServices: CreateSessionServices<
  SingletonServices,
  Services,
  UserSession
> = async (_services, _session) => {
  return {}
}
