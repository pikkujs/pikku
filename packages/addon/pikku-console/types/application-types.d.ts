import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { WiringService } from '../src/services/wiring.service.js'
import type { AddonService } from '../src/services/addon.service.js'
import type { SchemaService } from '../src/services/schema.service.js'
import type { OAuthService } from '../src/services/oauth.service.js'
import type { FileWatcherService } from '../src/services/file-watcher.service.js'
import type { WorkflowRunService } from '@pikku/core/workflow'
import type { AgentRunService } from '@pikku/core/ai-agent'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  wiringService: WiringService
  addonService: AddonService
  schemaService: SchemaService
  oauthService: OAuthService
  fileWatcherService: FileWatcherService
  workflowRunService?: WorkflowRunService
  agentRunService?: AgentRunService
}

export interface Services extends CoreServices<SingletonServices> {}
