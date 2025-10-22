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
import { EmailService } from './services/email.service.js'
import { SMSService } from './services/sms.service.js'
import { PaymentService } from './services/payment.service.js'
import { AnalyticsService } from './services/analytics.service.js'
import { StorageService } from './services/storage.service.js'

export const createConfig: CreateConfig<Config> = async () => {
  return {} as Config
}

export const createSingletonServices: CreateSingletonServices<
  Config,
  SingletonServices
> = async (_config) => {
  const variables = new LocalVariablesService()

  return {
    config: _config,
    logger: console,
    variables,
    schema: {} as any,
    email: new EmailService(),
    sms: new SMSService(),
    payment: new PaymentService(),
    analytics: new AnalyticsService(),
    storage: new StorageService(),
  }
}

export const createSessionServices: CreateSessionServices<
  SingletonServices,
  Services,
  UserSession
> = async (_singletonServices, _interaction) => {
  return {} as Services
}
