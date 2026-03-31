import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { MetaService } from '@pikku/core/services'
import type { WiringService } from '../src/services/wiring.service.js'
import type { AddonService } from '../src/services/addon.service.js'
import type { OAuthService } from '../src/services/oauth.service.js'
import type { FileWatcherService } from '../src/services/file-watcher.service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  metaService: MetaService
  wiringService: WiringService
  addonService: AddonService
  oauthService: OAuthService
  fileWatcherService: FileWatcherService
}

export interface Services extends CoreServices<SingletonServices> {}
