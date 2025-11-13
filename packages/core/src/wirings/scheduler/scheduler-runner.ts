import {
  PikkuInteraction,
  PikkuWiringTypes,
  type CoreServices,
  type CoreSingletonServices,
  type CoreUserSession,
  type CreateSessionServices,
} from '../../types/core.types.js'
import type { CoreScheduledTask } from './scheduler.types.js'
import { getErrorResponse, PikkuError } from '../../errors/error-handler.js'
import { closeSessionServices } from '../../utils.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { rpcService } from '../rpc/rpc-runner.js'
import { PikkuUserSessionService } from '../../services/user-session-service.js'
import {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'

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

export const wireScheduler = <
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<void, void>
  >,
>(
  scheduledTask: CoreScheduledTask<PikkuFunctionConfig>
) => {
  const meta = pikkuState('scheduler', 'meta')
  const taskMeta = meta[scheduledTask.name]
  if (!taskMeta) {
    throw new Error('Task metadata not found')
  }
  addFunction(taskMeta.pikkuFuncName, {
    func: scheduledTask.func.func,
    auth: scheduledTask.func.auth,
    permissions: scheduledTask.func.permissions,
    middleware: scheduledTask.func.middleware as any,
    tags: scheduledTask.func.tags,
    docs: scheduledTask.func.docs as any,
  })

  const tasks = pikkuState('scheduler', 'tasks')
  if (tasks.has(scheduledTask.name)) {
    throw new Error(`Scheduled task already exists: ${scheduledTask.name}`)
  }
  tasks.set(scheduledTask.name, scheduledTask)
}

class ScheduledTaskNotFoundError extends PikkuError {
  constructor(title: string) {
    super(`Scheduled task not found: ${title}`)
  }
}

class ScheduledTaskSkippedError extends PikkuError {
  constructor(taskName: string, reason?: string) {
    super(
      `Scheduled task '${taskName}' was skipped${reason ? `: ${reason}` : ''}`
    )
    this.name = 'ScheduledTaskSkippedError'
  }
}

export async function runScheduledTask({
  name,
  session,
  singletonServices,
  createSessionServices,
}: RunScheduledTasksParams): Promise<void> {
  let sessionServices: any
  const task = pikkuState('scheduler', 'tasks').get(name)
  const meta = pikkuState('scheduler', 'meta')[name]

  const userSession = new PikkuUserSessionService()
  if (session) {
    userSession.set(session)
  }

  if (!task) {
    throw new ScheduledTaskNotFoundError(`Scheduled task not found: ${name}`)
  }
  if (!meta) {
    throw new ScheduledTaskNotFoundError(
      `Scheduled task meta not found: ${name}`
    )
  }

  // Create the scheduled task interaction object
  const interaction: PikkuInteraction = {
    scheduledTask: {
      name,
      schedule: task.schedule,
      executionTime: new Date(),
      skip: (reason?: string) => {
        throw new ScheduledTaskSkippedError(name, reason)
      },
    },
  }

  try {
    singletonServices.logger.info(
      `Running schedule task: ${name} | schedule: ${task.schedule}`
    )

    const getAllServices = async () => {
      sessionServices = await createSessionServices?.(
        singletonServices,
        interaction,
        session
      )

      return rpcService.injectRPCService(
        {
          ...singletonServices,
          ...sessionServices,
          userSession,
        },
        interaction
      )
    }

    const result = await runPikkuFunc(
      PikkuWiringTypes.scheduler,
      meta.name,
      meta.pikkuFuncName,
      {
        singletonServices,
        getAllServices,
        userSession,
        auth: false,
        data: () => undefined,
        inheritedMiddleware: meta.middleware,
        wireMiddleware: task.middleware,
        tags: task.tags,
        interaction,
      }
    )

    return result
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

export const getScheduledTasks = () => {
  return pikkuState('scheduler', 'tasks')
}
