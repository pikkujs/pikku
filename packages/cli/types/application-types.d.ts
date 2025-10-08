import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
} from '@pikku/core'
import type { CLILogger } from '../src/services/cli-logger.service.js'
import { PikkuCLIConfig } from '../src/utils/pikku-cli-config.ts'
import { InspectorState } from '@pikku/inspector'

export interface Config extends CoreConfig {
  configFile: string
  tags?: string[]
  types?: string[]
  directories?: string[]
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  logger: CLILogger
  cliConfig: PikkuCLIConfig
  getInspectorState: (refresh?: boolean = false) => Promise<InspectorState>
}

export interface Services extends CoreServices<SingletonServices, {}> {}
