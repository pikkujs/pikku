import type {
  CoreConfig,
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
} from '@pikku/core'
import type { DeploymentService } from '@pikku/core'

export interface Config extends CoreConfig {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  deploymentService?: DeploymentService
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
