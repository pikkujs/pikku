import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { CLILogger } from '../src/services/cli-logger.service.js'
import { PikkuCLIConfig } from '../types/config.d.ts'
import { InspectorState } from '@pikku/inspector'

export interface Config extends CoreConfig<PikkuCLIConfig> {
  // Preloaded inspector state from stateInput file (if provided)
  preloadedInspectorState?: Omit<InspectorState, 'typesLookup'>
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  logger: CLILogger
  getInspectorState: (
    refresh?: boolean,
    setupOnly?: boolean,
    bootstrapMode?: boolean
  ) => Promise<InspectorState>
}

export interface Services extends CoreServices<SingletonServices, {}> {}

export interface UserSession extends CoreUserSession {}
