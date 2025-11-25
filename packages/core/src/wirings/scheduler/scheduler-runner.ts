import {
  PikkuWire,
  type CoreServices,
  type CoreSingletonServices,
  type CoreUserSession,
  type CreateWireServices,
} from '../../types/core.types.js'
import type { CoreScheduledTask } from './scheduler.types.js'
import { getErrorResponse, PikkuError } from '../../errors/error-handler.js'
import { closeWireServices } from '../../utils.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { PikkuSessionService } from '../../services/user-session-service.js'
import {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'

export type RunScheduledTasksParams = {
  name: string
  session?: CoreUserSession
  singletonServices: CoreSingletonServices
  createWireServices?: CreateWireServices<
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
  const meta = pikkuState(null, 'scheduler', 'meta')
  const taskMeta = meta[scheduledTask.name]
  if (!taskMeta) {
    throw new Error('Task metadata not found')
  }
  addFunction(taskMeta.pikkuFuncName, {
    func: scheduledTask.func.func,
    auth: scheduledTask.func.auth,
    permissions: scheduledTask.func.permissions,
    middleware: scheduledTask.func.middleware,
    tags: scheduledTask.func.tags,
  })

  const tasks = pikkuState(null, 'scheduler', 'tasks')
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
  createWireServices,
}: RunScheduledTasksParams): Promise<void> {
  let wireServices: any
  const task = pikkuState(null, 'scheduler', 'tasks').get(name)
  const meta = pikkuState(null, 'scheduler', 'meta')[name]

  const userSession = new PikkuSessionService()
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

  // Create the scheduled task wire object
  const wire: PikkuWire = {
    scheduledTask: {
      name,
      schedule: task.schedule,
      executionTime: new Date(),
      skip: (reason?: string) => {
        throw new ScheduledTaskSkippedError(name, reason)
      },
    },
    session: userSession,
  }

  try {
    singletonServices.logger.info(
      `Running schedule task: ${name} | schedule: ${task.schedule}`
    )

    await runPikkuFunc('scheduler', meta.name, meta.pikkuFuncName, {
      singletonServices,
      createWireServices,
      auth: false,
      data: () => undefined,
      inheritedMiddleware: meta.middleware,
      wireMiddleware: task.middleware,
      tags: task.tags,
      wire,
    })
  } catch (e: any) {
    const errorResponse = getErrorResponse(e)
    if (errorResponse != null) {
      singletonServices.logger.error(e)
    }
    throw e
  } finally {
    if (wireServices) {
      await closeWireServices(singletonServices.logger, wireServices)
    }
  }
}

export const getScheduledTasks = () => {
  return pikkuState(null, 'scheduler', 'tasks')
}
