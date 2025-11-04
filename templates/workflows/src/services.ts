import { pikkuConfig, pikkuServices, pikkuSessionServices } from '../.pikku/pikku-types.gen.js'
import type {
  Services,
  SingletonServices,
} from '../types/application-types.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

export const createSingletonServices = pikkuServices(async (config, additionalServices) => {
  return {
    config,
    ...additionalServices,
  } as SingletonServices
})

export const createSessionServices = pikkuSessionServices(async (singletonServices) => {
  return {} as Services
})
