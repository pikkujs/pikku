import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
} from '../types/core.types.js'
import type {
  CoreScheduledTask,
  ScheduledTasksMeta,
} from './scheduler.types.js'
import type { CoreAPIFunctionSessionless } from '../types/functions.types.js'

import { getErrorResponse } from '../errors/error-handler.js'
import { closeServices } from '../utils.js'

export type RunScheduledTasksParams = {
  name: string
  session?: CoreUserSession
  singletonServices: CoreSingletonServices
  createSessionServices?: CreateSessionServices<
    CoreSingletonServices,
    CoreUserSession,
    CoreServices
  >
}

if (!global.vramework?.scheduledTasks) {
  global.vramework = global.vramework || {}
  global.vramework.scheduledTasks = new Map<string, CoreScheduledTask>()
  global.vramework.scheduledTasksMeta = []
}

const scheduledTasks = (): Map<string, CoreScheduledTask> => {
  return global.vramework.scheduledTasks
}

const scheduledTasksMeta = (data?: ScheduledTasksMeta) => {
  if (data) {
    global.vramework.scheduledTasksMeta = data
  }
  return global.vramework.scheduledTasksMeta
}

export const addScheduledTask = <
  APIFunction extends CoreAPIFunctionSessionless<void, void>,
>(
  scheduledTask: CoreScheduledTask<APIFunction>
) => {
  if (scheduledTasks().has(scheduledTask.name)) {
    throw new Error(`Scheduled task already exists: ${scheduledTask.name}`)
  }
  scheduledTasks().set(scheduledTask.name, scheduledTask)
}

export const clearScheduledTasks = () => {
  scheduledTasks().clear()
}

export const setScheduledTasksMeta = (
  _scheduledTasksMeta: ScheduledTasksMeta
) => {
  scheduledTasksMeta(_scheduledTasksMeta)
}

/**
 * Returns all the cron jobs
 * @internal
 */
export const getScheduledTasks = () => {
  return {
    scheduledTasks: scheduledTasks(),
    scheduledTasksMeta: scheduledTasksMeta(),
  }
}

class ScheduledTaskNotFoundError extends Error {
  constructor(title: string) {
    super(`Scheduled task not found: ${title}`)
  }
}

export async function runScheduledTask({
  name,
  session,
  singletonServices,
  createSessionServices,
}: RunScheduledTasksParams): Promise<void> {
  let sessionServices: CoreServices | undefined
  const trackerId: string = crypto.randomUUID().toString()

  try {
    const task = scheduledTasks().get(name)

    if (!task) {
      throw new ScheduledTaskNotFoundError(`Scheduled task not found: ${name}`)
    }

    singletonServices.logger.info(
      `Running schedule task: ${name} | schedule: ${task.schedule}}`
    )

    let allServices = singletonServices
    if (createSessionServices) {
      const sessionServices = await createSessionServices(
        singletonServices,
        {},
        session
      )
      allServices = { ...singletonServices, ...sessionServices }
    }

    await task.func(allServices, undefined, session!)
  } catch (e: any) {
    const errorResponse = getErrorResponse(e)

    if (errorResponse != null) {
      singletonServices.logger.warn(`Error id: ${trackerId}`)
      singletonServices.logger.error(e)
    }

    throw e
  } finally {
    await closeServices(singletonServices.logger, sessionServices)
  }
}
