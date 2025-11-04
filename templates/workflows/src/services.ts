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

export const createConfig: CreateConfig<Config> = async () => {
  return {}
}

export const createSingletonServices: CreateSingletonServices<
  Config,
  SingletonServices
> = async (config, additionalServices) => {
  return {
    config,
    ...additionalServices,
  } as SingletonServices
}

export const createSessionServices: CreateSessionServices<
  SingletonServices,
  Services,
  UserSession
> = async (singletonServices) => {
  return {} as Services
}
