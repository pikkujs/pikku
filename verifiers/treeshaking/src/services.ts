import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku'
import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'
import { EmailService } from './services/email.service.js'
import { SMSService } from './services/sms.service.js'
import { PaymentService } from './services/payment.service.js'
import { AnalyticsService } from './services/analytics.service.js'
import { StorageService } from './services/storage.service.js'
import { UserContextService } from './services/user-context.service.js'
import { UserPreferencesService } from './services/user-preferences.service.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

export const createSingletonServices = pikkuServices(async (_config) => {
  const variables = new LocalVariablesService()

  return {
    config: _config,
    logger: new ConsoleLogger(),
    variables,
    secrets: new LocalSecretService(variables),
    schema: {} as any,
    email: new EmailService(),
    sms: new SMSService(),
    payment: new PaymentService(),
    analytics: new AnalyticsService(),
    storage: new StorageService(),
  }
})

export const createWireServices = pikkuWireServices(
  async ({ email, logger }) => {
    logger.info('Creating wire services with email')
    return {
      userContext: new UserContextService(),
      userPreferences: new UserPreferencesService(),
    }
  }
)
