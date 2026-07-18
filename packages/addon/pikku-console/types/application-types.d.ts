import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { MetaService } from '@pikku/core/services'
import type { WiringService } from '../src/services/wiring.service.js'
import type { AddonService } from '../src/services/addon.service.js'
import type { CodeEditService } from '../src/services/code-edit.service.js'
import type { StateDiffService } from '../src/services/state-diff.service.js'
import type { DbSchemaService } from '../src/services/db-schema.service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  metaService: MetaService
  wiringService: WiringService
  addonService: AddonService
  codeEditService: CodeEditService | null
  stateDiffService: StateDiffService | null
  dbSchemaService: DbSchemaService | null
}

export interface Services extends CoreServices<SingletonServices> {}
