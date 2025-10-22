import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { EmailService } from '../services/email.service.js'
import type { SMSService } from '../services/sms.service.js'
import type { PaymentService } from '../services/payment.service.js'
import type { AnalyticsService } from '../services/analytics.service.js'
import type { StorageService } from '../services/storage.service.js'

export type Config = CoreConfig

export interface SingletonServices extends CoreSingletonServices<Config> {
  email: EmailService
  sms: SMSService
  payment: PaymentService
  analytics: AnalyticsService
  storage: StorageService
}

export interface Services
  extends CoreServices<SingletonServices, UserSession> {}

export interface UserSession extends CoreUserSession {}
