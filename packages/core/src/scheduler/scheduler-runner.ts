import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
} from '../types/core.types.js'
import type { CoreScheduledTask } from './scheduler.types.js'
import type { CoreAPIFunctionSessionless } from '../types/functions.types.js'
import { getErrorResponse } from '../errors/error-handler.js'
import { closeSessionServices } from '../utils.js'
import { pikkuState } from '../pikku-state.js'
import { getFunctionName, runPikkuFunc } from '../pikku-func.js'

export type RunScheduledTasksParams = {
  name: string
  session?: CoreUserSession
  singletonServices: CoreSingletonServices
  createSessionServices?: CreateSessionServices<
    CoreSingletonServices,
    CoreServices<CoreSingletonServices>,
    CoreUserSession
  >
}

export const addScheduledTask = <
  APIFunction extends CoreAPIFunctionSessionless<void, void>,
>(
  scheduledTask: CoreScheduledTask<APIFunction>
) => {
  const tasks = pikkuState('scheduler', 'tasks')
  if (tasks.has(scheduledTask.name)) {
    throw new Error(`Scheduled task already exists: ${scheduledTask.name}`)
  }
  tasks.set(scheduledTask.name, scheduledTask)
}

class ScheduledTaskNotFoundError extends Error {
  constructor(title: string) {
    super(`Scheduled task not found: ${title}`)
  }
}

export async function runScheduledTask<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
>({
  name,
  session,
  singletonServices,
  createSessionServices,
}: RunScheduledTasksParams): Promise<void> {
  let sessionServices: CoreServices | undefined
  try {
    const task = pikkuState('scheduler', 'tasks').get(name)

    if (!task) {
      throw new ScheduledTaskNotFoundError(`Scheduled task not found: ${name}`)
    }

    singletonServices.logger.info(
      `Running schedule task: ${name} | schedule: ${task.schedule}`
    )

    const getAllServices = async () => {
      if (createSessionServices) {
        const sessionServices = await createSessionServices(
          singletonServices,
          {},
          session
        )
        return { ...singletonServices, ...sessionServices }
      }
      return singletonServices
    }

    return await runPikkuFunc(getFunctionName(task.func), {
      singletonServices,
      getAllServices,
      session,
      data: undefined,
    })
  } catch (e: any) {
    const errorResponse = getErrorResponse(e)
    if (errorResponse != null) {
      singletonServices.logger.error(e)
    }
    throw e
  } finally {
    if (sessionServices) {
      await closeSessionServices(singletonServices.logger, sessionServices)
    }
  }
}
