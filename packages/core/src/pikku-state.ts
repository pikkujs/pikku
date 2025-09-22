import { ChannelsMeta, CoreChannel } from './wirings/channel/channel.types.js'
import {
  CoreHTTPFunctionWiring,
  HTTPMethod,
  HTTPWiringsMeta,
} from './wirings/http/http.types.js'
import { FunctionsMeta, CorePikkuMiddleware } from './types/core.types.js'
import {
  CoreScheduledTask,
  ScheduledTasksMeta,
} from './wirings/scheduler/scheduler.types.js'
import { ErrorDetails, PikkuError } from './errors/error-handler.js'
import {
  CorePermissionGroup,
  CorePikkuFunctionConfig,
  CorePikkuPermission,
} from './function/functions.types.js'
import {
  queueWorkersMeta,
  CoreQueueWorker,
} from './wirings/queue/queue.types.js'
import {
  CoreMCPResource,
  CoreMCPTool,
  CoreMCPPrompt,
  MCPResourceMeta,
  MCPToolMeta,
  MCPPromptMeta,
} from './wirings/mcp/mcp.types.js'
import { CLIProgramMeta, CLIProgramState } from './wirings/cli/cli.types.js'

interface PikkuState {
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
    meta: queueWorkersMeta
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
    meta: Record<string, CLIProgramMeta>
    programs: Record<string, CLIProgramState>
  }
  misc: {
    errors: Map<PikkuError, ErrorDetails>
    schemas: Map<string, any>
    middleware: Record<string, CorePikkuMiddleware[]>
    permissions: Record<string, CorePermissionGroup | CorePikkuPermission[]>
  }
}

export const resetPikkuState = () => {
  globalThis.pikkuState = {
    function: {
      meta: {},
      functions: new Map(),
    },
    rpc: {
      meta: {},
      files: new Map(),
    },
    http: {
      permissions: new Map(),
      middleware: new Map(),
      routes: new Map(),
      meta: {},
    },
    channel: {
      channels: new Map(),
      meta: {},
    },
    scheduler: {
      tasks: new Map(),
      meta: [] as unknown as ScheduledTasksMeta,
    },
    queue: {
      registrations: new Map(),
      meta: {},
    },
    mcp: {
      resources: new Map(),
      resourcesMeta: {} as MCPResourceMeta,
      tools: new Map(),
      toolsMeta: {} as MCPToolMeta,
      prompts: new Map(),
      promptsMeta: {} as MCPPromptMeta,
    },
    cli: {
      meta: {},
      programs: {},
    },
    misc: {
      errors: globalThis.pikkuState?.misc?.errors || new Map(),
      schemas: new Map(),
      middleware: {},
      permissions: {},
    },
  } as PikkuState
}

if (!globalThis.pikkuState) {
  resetPikkuState()
}

export const pikkuState = <
  Type extends keyof PikkuState,
  Content extends keyof PikkuState[Type],
>(
  type: Type,
  content: Content,
  value?: PikkuState[Type][Content]
): PikkuState[Type][Content] => {
  if (value) {
    globalThis.pikkuState[type][content] = value
  }
  return globalThis.pikkuState[type][content]
}
