import { ChannelsMeta, CoreAPIChannels } from './channel/channel.types.js'
import {
  CoreHTTPFunctionRoutes,
  HTTPRoutesMeta,
} from './http/http-routes.types.js'
import { FunctionsMeta, PikkuMiddleware } from './types/core.types.js'
import {
  CoreScheduledTask,
  ScheduledTasksMeta,
} from './scheduler/scheduler.types.js'
import { ErrorDetails, PikkuError } from './errors/error-handler.js'
import { CoreAPIFunction, CoreAPIFunctionSessionless } from './types/functions.types.js'

interface PikkuState {
  functions: {
    meta: FunctionsMeta
    nameToFunction: Map<string, CoreAPIFunction<any, any> | CoreAPIFunctionSessionless<any, any>>
    functionToName: Map<CoreAPIFunction<any, any> | CoreAPIFunctionSessionless<any, any>, string>
  }
  http: {
    middleware: Array<{ route: string; middleware: PikkuMiddleware[] }>
    routes: CoreHTTPFunctionRoutes
    meta: HTTPRoutesMeta
  }
  channel: {
    channels: CoreAPIChannels
    meta: ChannelsMeta
  }
  scheduler: {
    tasks: Map<string, CoreScheduledTask>
    meta: ScheduledTasksMeta
  }
  misc: {
    errors: Map<PikkuError, ErrorDetails>
    schemas: Map<string, any>
  }
}

export const resetPikkuState = () => {
  globalThis.pikkuState = {
    http: {
      middleware: [],
      routes: [],
      meta: [],
    },
    channel: {
      channels: [],
      meta: [],
    },
    scheduler: {
      tasks: new Map(),
      meta: [],
    },
    misc: {
      errors: globalThis.pikkuState?.misc?.errors || new Map(),
      schemas: globalThis.pikkuState?.misc?.schema || new Map(),
    },
  }
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
