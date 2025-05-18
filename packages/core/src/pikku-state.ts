import { ChannelsMeta, CoreAPIChannel } from './channel/channel.types.js'
import {
  CoreHTTPFunctionRoute,
  HTTPMethod,
  HTTPRoutesMeta,
} from './http/http.types.js'
import { FunctionsMeta, PikkuMiddleware } from './types/core.types.js'
import {
  CoreScheduledTask,
  ScheduledTasksMeta,
} from './scheduler/scheduler.types.js'
import { ErrorDetails, PikkuError } from './errors/error-handler.js'
import {
  CoreAPIFunction,
  CoreAPIFunctionSessionless,
} from './function/functions.types.js'

interface PikkuState {
  functions: {
    meta: FunctionsMeta
    nameToFunction: Map<
      string,
      CoreAPIFunction<any, any> | CoreAPIFunctionSessionless<any, any>
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
  misc: {
    errors: Map<PikkuError, ErrorDetails>
    schemas: Map<string, any>
  }
}

export const resetPikkuState = () => {
  globalThis.pikkuState = {
    functions: {
      meta: {},
      nameToFunction: new Map(),
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
