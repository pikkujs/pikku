import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { EventHubService } from '@pikku/core/channel'
import type { QueueService } from '@pikku/core/queue'
import type { JWTService } from '@pikku/core/services'
import type {
  AIStorageService,
  AIAgentRunnerService,
  AIRunStateService,
} from '@pikku/core/services'
import type { EventHubTopics } from './eventhub-topics.js'
import type { TodoStore } from '../src/services/store.service.ts'
import type { auth } from '../src/auth.ts'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'

export interface Config extends CoreConfig {
  awsRegion: string
}

export interface UserSession extends CoreUserSession {
  userId: string
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  jwt?: JWTService
  eventHub?: EventHubService<EventHubTopics>
  queueService?: QueueService
  todoStore: TodoStore
  aiStorage?: AIStorageService
  aiAgentRunner?: AIAgentRunnerService
  aiRunState?: AIRunStateService
  kysely?: Kysely<KyselyPikkuDB>
  auth: () => Promise<Awaited<ReturnType<typeof auth>>>
}

export interface Services extends CoreServices<SingletonServices> {}
