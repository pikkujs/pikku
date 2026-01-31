import { PikkuError, ErrorDetails } from '../errors/error-handler.js'
import {
  CorePikkuFunctionConfig,
  CorePermissionGroup,
  CorePikkuPermission,
} from '../function/functions.types.js'
import { CorePikkuTriggerFunctionConfig } from '../wirings/trigger/trigger.types.js'
import { CoreChannel, ChannelsMeta } from '../wirings/channel/channel.types.js'
import { CLIMeta, CLIProgramState } from '../wirings/cli/cli.types.js'
import {
  HTTPMethod,
  CoreHTTPFunctionWiring,
  HTTPWiringsMeta,
} from '../wirings/http/http.types.js'
import {
  CoreMCPResource,
  MCPResourceMeta,
  CoreMCPTool,
  MCPToolMeta,
  CoreMCPPrompt,
  MCPPromptMeta,
} from '../wirings/mcp/mcp.types.js'
import {
  CoreQueueWorker,
  QueueWorkersMeta,
} from '../wirings/queue/queue.types.js'
import {
  CoreScheduledTask,
  ScheduledTasksMeta,
} from '../wirings/scheduler/scheduler.types.js'
import {
  CoreWorkflow,
  WorkflowsRuntimeMeta,
  WorkflowWires,
} from '../wirings/workflow/workflow.types.js'
import type {
  WorkflowGraphDefinition,
  GraphNodeConfig,
} from '../wirings/workflow/graph/workflow-graph.types.js'
import {
  CoreTrigger,
  CoreTriggerSource,
  TriggerMeta,
} from '../wirings/trigger/trigger.types.js'
import {
  FunctionsMeta,
  CorePikkuMiddleware,
  CorePikkuMiddlewareGroup,
  FunctionServicesMeta,
  CreateConfig,
  CreateSingletonServices,
  CreateWireServices,
  CoreConfig,
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
} from './core.types.js'

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
    /** Maps namespace aliases to package names (e.g., 'ext' -> '@pikku/templates-function-external') */
    externalPackages: Map<string, string>
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
    graphRegistrations: Map<string, WorkflowGraphDefinition<any>>
    /** DSL workflow wirings (from wireWorkflow({ func: ... })) */
    wirings: Map<any, { wires: WorkflowWires; func: any }>
    /** Graph workflow wirings (from wireWorkflow({ graph: ... })) */
    graphWirings: Map<
      any,
      { wires: WorkflowWires; graph: Record<string, GraphNodeConfig<string>> }
    >
    meta: WorkflowsRuntimeMeta
    httpRoutes: Map<string, { workflowName: string; startNode?: string }>
  }
  trigger: {
    functions: Map<string, CorePikkuTriggerFunctionConfig<any, any>>
    triggers: Map<string, CoreTrigger>
    triggerSources: Map<string, CoreTriggerSource>
    meta: TriggerMeta
    workflowTargets: Map<
      string,
      Array<{ workflowName: string; startNode: string }>
    >
  }
  mcp: {
    resources: Map<string, CoreMCPResource>
    resourcesMeta: MCPResourceMeta
    tools: Map<string, CoreMCPTool>
    toolsMeta: MCPToolMeta
    prompts: Map<string, CoreMCPPrompt>
    promptsMeta: MCPPromptMeta
  }
  cli: {
    meta: CLIMeta | Record<string, any> // Backward compatible with old published CLI format
    programs: Record<string, CLIProgramState>
  }
  middleware: {
    tagGroup: Record<string, CorePikkuMiddlewareGroup>
    httpGroup: Record<string, CorePikkuMiddlewareGroup>
    tagGroupMeta: Record<
      string,
      {
        exportName: string | null
        sourceFile: string
        position: number
        services: FunctionServicesMeta
        middlewareCount: number
        isFactory: boolean
      }
    >
    httpGroupMeta: Record<
      string,
      {
        exportName: string | null
        sourceFile: string
        position: number
        services: FunctionServicesMeta
        middlewareCount: number
        isFactory: boolean
      }
    >
  }
  permissions: {
    tagGroup: Record<string, CorePermissionGroup | CorePikkuPermission[]>
    httpGroup: Record<string, CorePermissionGroup | CorePikkuPermission[]>
    tagGroupMeta: Record<
      string,
      {
        exportName: string | null
        sourceFile: string
        position: number
        services: FunctionServicesMeta
        permissionCount: number
        isFactory: boolean
      }
    >
    httpGroupMeta: Record<
      string,
      {
        exportName: string | null
        sourceFile: string
        position: number
        services: FunctionServicesMeta
        permissionCount: number
        isFactory: boolean
      }
    >
  }
  misc: {
    errors: Map<PikkuError, ErrorDetails>
    schemas: Map<string, any>
    middleware: Record<string, CorePikkuMiddleware[]>
    permissions: Record<string, CorePermissionGroup | CorePikkuPermission[]>
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
  }
}
