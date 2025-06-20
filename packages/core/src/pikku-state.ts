import { ChannelsMeta, CoreAPIChannel } from './events/channel/channel.types.js'
import {
  CoreHTTPFunctionRoute,
  HTTPMethod,
  HTTPRoutesMeta,
} from './events/http/http.types.js'
import { FunctionsMeta, PikkuMiddleware } from './types/core.types.js'
import {
  CoreScheduledTask,
  ScheduledTasksMeta,
} from './events/scheduler/scheduler.types.js'
import { ErrorDetails, PikkuError } from './errors/error-handler.js'
import { CorePikkuFunctionConfig } from './function/functions.types.js'
import { RPCMeta } from './events/rpc/rpc-types.js'
import {
  QueueProcessorsMeta,
  CoreQueueProcessor,
} from './events/queue/queue.types.js'

interface PikkuState {
  function: {
    meta: FunctionsMeta
    functions: Map<string, CorePikkuFunctionConfig<any, any>>
  }
  rpc: {
    meta: Record<string, RPCMeta>
    files: Map<
      string,
      {
        exportedName: string
        path: string
      }
    >
  }
  http: {
    middleware: Array<{ route: string; middleware: PikkuMiddleware[] }>
    routes: Map<HTTPMethod, Map<string, CoreHTTPFunctionRoute<any, any, any>>>
    meta: HTTPRoutesMeta
  }
  channel: {
    channels: Map<string, CoreAPIChannel<any, any>>
    meta: ChannelsMeta
  }
  scheduler: {
    tasks: Map<string, CoreScheduledTask>
    meta: ScheduledTasksMeta
  }
  queue: {
    registrations: Map<string, CoreQueueProcessor<any, any>>
    meta: QueueProcessorsMeta
  }
  misc: {
    errors: Map<PikkuError, ErrorDetails>
    schemas: Map<string, any>
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
      middleware: [],
      routes: new Map(),
      meta: [],
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
    misc: {
      errors: globalThis.pikkuState?.misc?.errors || new Map(),
      schemas: globalThis.pikkuState?.misc?.schema || new Map(),
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
