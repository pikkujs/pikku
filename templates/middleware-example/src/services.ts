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
import { ConsoleLogger } from '@pikku/core/services'
import {
  RequiredSingletonServices,
  singletonServices,
} from './.pikku/pikku-services.gen.js'
import { MiddlewareChecker } from './services/middleware-checker.service.js'

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
