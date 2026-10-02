import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { MetaService } from '@pikku/core/services'
import type { WiringService } from '../src/services/wiring.service.js'
import type { AddonService } from '../src/services/addon.service.js'
import type { AddonReadinessService } from '../src/services/addon-readiness.service.js'
import type { CodeEditService } from '@pikku/code-edit'
import type { StateDiffService } from '../src/services/state-diff.service.js'
import type { DbSchemaService } from '../src/services/db-schema.service.js'
import type { KnowledgeService } from '../src/services/knowledge.service.js'
import type { DesignService } from '../src/services/design.service.js'
import type { PageScreenshotService } from '../src/services/page-screenshot.service.js'
import type { I18nService } from '@pikku/code-edit/i18n'
import type { WorkspaceFilesService } from '@pikku/code-edit/files'
import type { GitService } from '@pikku/code-edit/git'
import type { TypeScriptService } from '@pikku/code-edit/typescript'
import type { PagesService } from '@pikku/code-edit/routes'
import type { VerifyService } from '@pikku/code-edit/verify'
import type { BrandWorkspace } from '@pikku/code-edit/brand'
import type { SecretAdminService } from '../src/services/secret-admin.service.js'
import type { StudioHost } from '../src/services/studio-host.service.js'
import type { ScenarioRunStore } from '@pikku/core/scenario'
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
  designService: DesignService | null
  i18nService: I18nService | null
  workspaceFilesService: WorkspaceFilesService | null
  gitService: GitService | null
  typeScriptService: TypeScriptService | null
  /** Every frontend's pages, read from its TanStack route files; null outside local development. */
  pagesService: PagesService | null
  pageScreenshotService: PageScreenshotService | null
  verifyService: VerifyService | null
  brandService: BrandWorkspace | null
  /**
   * Past scenario runs and what they recorded. Declared as the interface rather
   * than the on-disk implementation: a hosted console keeps the same runs in a
   * database and its artifacts in object storage, and the functions that read
   * them should not have to know which one they are talking to.
   */
  scenarioRunStore: ScenarioRunStore | null
  studioHost: StudioHost | null
  /**
   * The host's resolved better-auth instance, wired by `pikkuBetterAuth`. The
   * console never constructs it — it is declared here only so the functions
   * that read the auth adapter (e.g. the user directory) are typed rather than
   * casting. Absent when the host wires no auth at all.
   */
  auth?: () => Promise<BetterAuthInstance>
}

export interface Services extends CoreServices<SingletonServices> {}
