import type { PikkuRawWire, CoreUserSession } from '../../types/core.types.js'
import type { CoreScheduledTask } from './scheduler.types.js'
import { getErrorResponse, PikkuError } from '../../errors/error-handler.js'
import {
  getSingletonServices,
  getCreateWireServices,
  pikkuState,
} from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../../services/user-session-service.js'
import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'

/** Parameters for {@link runScheduledTask}: the task's name, an optional session to run it with, and an optional trace ID. */
export type RunScheduledTasksParams = {
  name: string
  session?: CoreUserSession
  traceId?: string
}

/**
 * Registers a sessionless function to run on a cron schedule.
 *
 * The task only runs once a scheduler service (or a platform cron trigger
 * calling {@link runScheduledTask}) drives it; wiring alone schedules nothing.
 * The function receives no input, and can call `scheduledTask.skip()` on its
 * wire to end the run early.
 *
 * Registration needs the metadata `pikku` generates for the task. When none is
 * found the wiring is skipped with a warning rather than throwing.
 *
 * @param scheduledTask - The task's unique name, cron `schedule`, function, and optional middleware.
 * @throws {Error} When a task with the same name is already wired.
 *
 * @example snippet: wireScheduler
 */
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
    console.warn(
      `[pikku] Skipping scheduled task '${scheduledTask.name}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
  }
  addFunction(taskMeta.pikkuFuncId, {
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

/** Thrown by {@link runScheduledTask} when no task, or no generated metadata, exists for the requested name. */
export class ScheduledTaskNotFoundError extends PikkuError {
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

/**
 * Runs one wired scheduled task now. Scheduler services and platform cron handlers call this on each tick.
 *
 * When `session` is given it is placed on the wire, so the function and its
 * middleware see that user; otherwise the task runs without one.
 *
 * @param params - See {@link RunScheduledTasksParams}. `traceId` defaults to `cron-<name>-<timestamp>`.
 * @throws {ScheduledTaskNotFoundError} When the task or its metadata is missing.
 * @throws The error the function threw, including the one `scheduledTask.skip()` raises, so the caller can tell a skip from a failure.
 */
export async function runScheduledTask({
  name,
  session,
  traceId,
}: RunScheduledTasksParams): Promise<void> {
  const singletonServices = getSingletonServices()
  const createWireServices = getCreateWireServices()
  const resolvedTraceId = traceId ?? `cron-${name}-${Date.now()}`
  const scopedLogger =
    singletonServices.logger.scope?.(resolvedTraceId) ??
    singletonServices.logger
  const task = pikkuState(null, 'scheduler', 'tasks').get(name)
  const meta = pikkuState(null, 'scheduler', 'meta')[name]

  const userSession = new PikkuSessionService(singletonServices.sessionStore)
  if (session) {
    await userSession.set(session)
  }

  if (!task) {
    throw new ScheduledTaskNotFoundError(`Scheduled task not found: ${name}`)
  }
  if (!meta) {
    throw new ScheduledTaskNotFoundError(
      `Scheduled task meta not found: ${name}`
    )
  }

  const wire: PikkuRawWire = {
    traceId: resolvedTraceId,
    scheduledTask: {
      name,
      schedule: task.schedule,
      executionTime: new Date(),
      skip: (reason?: string) => {
        throw new ScheduledTaskSkippedError(name, reason)
      },
    },
    ...createMiddlewareSessionWireProps(userSession),
  }

  try {
    scopedLogger.info(
      `Running schedule task: ${name} | schedule: ${task.schedule}`
    )

    await runPikkuFunc('scheduler', meta.name, meta.pikkuFuncId, {
      singletonServices,
      createWireServices,
      data: () => undefined,
      inheritedMiddleware: meta.middleware,
      wireMiddleware: task.middleware,
      tags: task.tags,
      wire,
      sessionService: userSession,
      packageName: meta.packageName,
    })
  } catch (e: any) {
    const errorResponse = getErrorResponse(e)
    if (errorResponse != null) {
      scopedLogger.error(e)
    }
    throw e
  }
}

/** Every wired scheduled task, keyed by name. Scheduler services read this to know what to schedule. */
export const getScheduledTasks = () => {
  return pikkuState(null, 'scheduler', 'tasks')
}
