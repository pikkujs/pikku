import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { CLILogger } from '../src/services/cli-logger.service.js'
import { PikkuCLIConfig } from '../types/config.d.ts'
import { InspectorState } from '@pikku/inspector'

export interface Config extends CoreConfig<PikkuCLIConfig> {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  logger: CLILogger
  getInspectorState: (refresh?: boolean = false) => Promise<InspectorState>
}

export interface Services extends CoreServices<SingletonServices, {}> {}

export interface UserSession extends CoreUserSession {}
