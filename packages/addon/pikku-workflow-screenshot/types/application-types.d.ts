import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  ContentService,
} from '@pikku/core'
import type { ScreenshotService } from '../src/services/screenshot.service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  screenshotService: ScreenshotService
  content: ContentService
}

export interface Services extends CoreServices<SingletonServices> {}
