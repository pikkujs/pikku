import { ChannelsMeta, CoreAPIChannels } from './channel/channel.types.js'
import {
  CoreHTTPFunctionRoutes,
  HTTPRoutesMeta,
} from './http/http-routes.types.js'
import { PikkuMiddleware } from './types/core.types.js'
import {
  CoreScheduledTask,
  ScheduledTasksMeta,
} from './scheduler/scheduler.types.js'
import { ErrorDetails, PikkuError } from './errors/error-handler.js'

interface PikkuState {
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
  errors: {
    errors: Map<PikkuError, ErrorDetails>
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
    errors: {
      // We keep errors since they are registered globally
      errors: globalThis.pikkuState?.errors?.errors || new Map(),
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
