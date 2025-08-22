import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
} from '../../types/core.types.js'
import type {
  CoreScheduledTask,
  PikkuScheduledTask,
} from './scheduler.types.js'
import type { CorePikkuFunctionSessionless } from '../../function/functions.types.js'
import { getErrorResponse, PikkuError } from '../../errors/error-handler.js'
import { closeSessionServices } from '../../utils.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { rpcService } from '../rpc/rpc-runner.js'
import { combineMiddleware, runMiddleware } from '../../middleware-runner.js'

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
  PikkuFunction extends CorePikkuFunctionSessionless<void, void>,
>(
  scheduledTask: CoreScheduledTask<PikkuFunction>
) => {
  const meta = pikkuState('scheduler', 'meta')
  const taskMeta = meta[scheduledTask.name]
  if (!taskMeta) {
    throw new Error('Task metadata not found')
  }
  addFunction(taskMeta.pikkuFuncName, scheduledTask.func)

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

  if (!task) {
    throw new ScheduledTaskNotFoundError(`Scheduled task not found: ${name}`)
  }
  if (!meta) {
    throw new ScheduledTaskNotFoundError(
      `Scheduled task meta not found: ${name}`
    )
  }

  // Create the scheduled task interaction object
  const scheduledTask: PikkuScheduledTask = {
    name,
    schedule: task.schedule,
    executionTime: new Date(),
    skip: (reason?: string) => {
      throw new ScheduledTaskSkippedError(name, reason)
    },
  }

  try {
    singletonServices.logger.info(
      `Running schedule task: ${name} | schedule: ${task.schedule}`
    )

    let result: any

    // Main scheduled task execution logic wrapped for middleware handling
    const runMain = async () => {
      const getAllServices = async () => {
        if (createSessionServices) {
          const services = await createSessionServices(
            singletonServices,
            { scheduledTask },
            session
          )
          sessionServices = services
          return rpcService.injectRPCService({
            ...singletonServices,
            ...services,
          })
        }
        return singletonServices
      }

      result = await runPikkuFunc(meta.pikkuFuncName, {
        getAllServices,
        session,
        data: undefined,
        tags: task.tags,
      })
    }

    const funcConfig = pikkuState('function', 'functions').get(
      meta.pikkuFuncName
    )
    await runMiddleware(
      singletonServices,
      { scheduledTask },
      combineMiddleware({
        wiringMiddleware: task.middleware,
        wiringTags: task.tags,
        funcMiddleware: funcConfig?.middleware,
        funcTags: funcConfig?.tags,
      }),
      runMain
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
