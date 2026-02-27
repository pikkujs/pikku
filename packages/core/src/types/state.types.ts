import type { PikkuError, ErrorDetails } from '../errors/error-handler.js'
import type {
  CorePikkuFunctionConfig,
  CorePermissionGroup,
  CorePikkuPermission,
} from '../function/functions.types.js'
import type { CorePikkuTriggerFunctionConfig } from '../wirings/trigger/trigger.types.js'
import type {
  CoreChannel,
  ChannelsMeta,
} from '../wirings/channel/channel.types.js'
import type { CLIMeta, CLIProgramState } from '../wirings/cli/cli.types.js'
import type {
  HTTPMethod,
  CoreHTTPFunctionWiring,
  HTTPWiringsMeta,
} from '../wirings/http/http.types.js'
import type {
  CoreMCPResource,
  MCPResourceMeta,
  MCPToolMeta,
  CoreMCPPrompt,
  MCPPromptMeta,
} from '../wirings/mcp/mcp.types.js'
import type {
  CoreAIAgent,
  AIAgentMeta,
} from '../wirings/ai-agent/ai-agent.types.js'
import type {
  CoreQueueWorker,
  QueueWorkersMeta,
} from '../wirings/queue/queue.types.js'
import type {
  CoreScheduledTask,
  ScheduledTasksMeta,
} from '../wirings/scheduler/scheduler.types.js'
import type {
  CoreWorkflow,
  WorkflowsRuntimeMeta,
} from '../wirings/workflow/workflow.types.js'
import type {
  CoreTrigger,
  CoreTriggerSource,
  TriggerMeta,
  TriggerSourceMeta,
} from '../wirings/trigger/trigger.types.js'
import type {
  FunctionsMeta,
  CorePikkuMiddleware,
  CorePikkuMiddlewareGroup,
  CreateConfig,
  CreateSingletonServices,
  CreateWireServices,
  CoreConfig,
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
} from './core.types.js'
import type { CorePikkuChannelMiddleware } from '../wirings/channel/channel.types.js'

/**
 * State structure for an individual package
 */
export interface PikkuPackageState {
  function: {
    meta: FunctionsMeta
    functions: Map<string, CorePikkuFunctionConfig<any, any>>
  }
  rpc: {
    meta: Record<string, string>
    files: Map<
      string,
      {
        exportedName: string
        path: string
      }
    >
    /** Maps namespace aliases to package config (e.g., 'ext' -> { package: '@pikku/...', rpcEndpoint: '...' }) */
    addons: Map<
      string,
      { package: string; rpcEndpoint?: string; auth?: boolean; tags?: string[] }
    >
  }
  http: {
    middleware: Map<string, CorePikkuMiddleware<any, any>[]>
    permissions: Map<string, CorePermissionGroup | CorePikkuPermission[]>
    routes: Map<HTTPMethod, Map<string, CoreHTTPFunctionWiring<any, any, any>>>
    meta: HTTPWiringsMeta
  }
  channel: {
    channels: Map<string, CoreChannel<any, any>>
    meta: ChannelsMeta
  }
  scheduler: {
    tasks: Map<string, CoreScheduledTask>
    meta: ScheduledTasksMeta
  }
  queue: {
    registrations: Map<string, CoreQueueWorker>
    meta: QueueWorkersMeta
  }
  workflows: {
    registrations: Map<string, CoreWorkflow>
    meta: WorkflowsRuntimeMeta
  }
  trigger: {
    functions: Map<string, CorePikkuTriggerFunctionConfig<any, any>>
    triggers: Map<string, CoreTrigger>
    triggerSources: Map<string, CoreTriggerSource>
    meta: TriggerMeta
    sourceMeta: TriggerSourceMeta
  }
  mcp: {
    resources: Map<string, CoreMCPResource>
    resourcesMeta: MCPResourceMeta
    toolsMeta: MCPToolMeta
    prompts: Map<string, CoreMCPPrompt>
    promptsMeta: MCPPromptMeta
  }
  agent: {
    agents: Map<string, CoreAIAgent>
    agentsMeta: AIAgentMeta
  }
  cli: {
    meta: CLIMeta | Record<string, any> // Backward compatible with old published CLI format
    programs: Record<string, CLIProgramState>
  }
  middleware: {
    tagGroup: Record<string, CorePikkuMiddlewareGroup>
    httpGroup: Record<string, CorePikkuMiddlewareGroup>
  }
  channelMiddleware: {
    tagGroup: Record<string, CorePikkuChannelMiddleware[]>
  }
  permissions: {
    tagGroup: Record<string, CorePermissionGroup | CorePikkuPermission[]>
    httpGroup: Record<string, CorePermissionGroup | CorePikkuPermission[]>
  }
  misc: {
    errors: Map<PikkuError, ErrorDetails>
    schemas: Map<string, any>
    middleware: Record<string, CorePikkuMiddleware[]>
    channelMiddleware: Record<string, CorePikkuChannelMiddleware[]>
    permissions: Record<string, CorePermissionGroup | CorePikkuPermission[]>
  }
  models: {
    config: {
      models?: Record<
        string,
        string | { model: string; temperature?: number; maxSteps?: number }
      >
      agentDefaults?: { temperature?: number; maxSteps?: number }
      agentOverrides?: Record<
        string,
        { model?: string; temperature?: number; maxSteps?: number }
      >
    } | null
  }
  package: {
    /** Service factory functions for external packages */
    factories: {
      createConfig?: CreateConfig<CoreConfig>
      createSingletonServices?: CreateSingletonServices<
        CoreConfig,
        CoreSingletonServices
      >
      createWireServices?: CreateWireServices<
        CoreSingletonServices,
        CoreServices,
        CoreUserSession
      >
    } | null
    /** Cached singleton services for this package */
    singletonServices: CoreSingletonServices | null
    /** Absolute path to this package's .pikku directory */
    metaDir: string | null
  }
}
