import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  SchedulerService,
} from '@pikku/core'
import type { QueueService } from '@pikku/core/queue'
import type { WorkflowService } from '@pikku/core/workflow'

export interface Config extends CoreConfig {
  awsRegion: string
}

export interface UserSession extends CoreUserSession {
  userId: string
  orgId: string
  role: 'owner' | 'manager' | 'member' | 'viewer'
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  queueService?: QueueService
  schedulerService?: SchedulerService
  workflowService?: WorkflowService
}

export interface Services extends CoreServices<SingletonServices> {}
