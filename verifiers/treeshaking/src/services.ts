import type {
  Config,
  Services,
  SingletonServices,
  UserSession,
} from './types/application-types.d.js'
import {
  CreateConfig,
  CreateWireServices,
  CreateSingletonServices,
} from '@pikku/core'
import { ConsoleLogger, LocalVariablesService } from '@pikku/core/services'
import { EmailService } from './services/email.service.js'
import { SMSService } from './services/sms.service.js'
import { PaymentService } from './services/payment.service.js'
import { AnalyticsService } from './services/analytics.service.js'
import { StorageService } from './services/storage.service.js'
import { UserContextService } from './services/user-context.service.js'
import { UserPreferencesService } from './services/user-preferences.service.js'

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
    logger: new ConsoleLogger(),
    variables,
    schema: {} as any,
    email: new EmailService(),
    sms: new SMSService(),
    payment: new PaymentService(),
    analytics: new AnalyticsService(),
    storage: new StorageService(),
  }
}

export const createWireServices: CreateWireServices<
  SingletonServices,
  Services,
  UserSession
> = async ({ email, logger }) => {
  // Destructure services to test session service aggregation
  logger.info('Creating wire services with email')
  return {
    userContext: new UserContextService(),
    userPreferences: new UserPreferencesService(),
  }
}
