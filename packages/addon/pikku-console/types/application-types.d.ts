import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { MetaService } from '@pikku/core/ecosystem/services'
import type { WiringService } from '../src/services/wiring.service.js'
import type { AddonService } from '../src/services/addon.service.js'
import type { AddonReadinessService } from '../src/services/addon-readiness.service.js'
import type { CodeEditService } from '../src/services/code-edit.service.js'
import type { StateDiffService } from '../src/services/state-diff.service.js'
import type { DbSchemaService } from '../src/services/db-schema.service.js'
import type { KnowledgeService } from '../src/services/knowledge.service.js'
import type { SecretAdminService } from '../src/services/secret-admin.service.js'
import type { BetterAuthInstance } from '@pikku/better-auth'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  metaService: MetaService
  wiringService: WiringService
  /**
   * Secret administration. The console's own surface for it — the addon holds
   * the `SecretService` so no console function has to.
   */
  secretAdminService: SecretAdminService
  addonService: AddonService
  addonReadinessService: AddonReadinessService
  codeEditService: CodeEditService | null
  stateDiffService: StateDiffService | null
  dbSchemaService: DbSchemaService | null
  knowledgeService: KnowledgeService | null
  /**
   * The host's resolved better-auth instance, wired by `pikkuBetterAuth`. The
   * console never constructs it — it is declared here only so the functions
   * that read the auth adapter (e.g. the user directory) are typed rather than
   * casting. Absent when the host wires no auth at all.
   */
  auth?: () => Promise<BetterAuthInstance>
}

export interface Services extends CoreServices<SingletonServices> {}
