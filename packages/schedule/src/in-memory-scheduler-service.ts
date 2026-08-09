import { CronJob } from 'cron'
import type {
  CoreUserSession,
  ScheduledTaskInfo,
  ScheduledTaskSummary,
} from '@pikku/core'
import { SchedulerService, parseDurationString } from '@pikku/core'
import { pikkuState, getSingletonServices } from '@pikku/core/ecosystem'
import { runScheduledTask, getScheduledTasks } from '@pikku/core/scheduler'
import { rpcService } from '@pikku/core/rpc'

interface DelayedTask {
  taskId: string
  rpcName: string
  data?: any
  session?: CoreUserSession
  scheduledFor: Date
  timer: ReturnType<typeof setTimeout>
}

const getLogger = () => {
  return pikkuState(null, 'package', 'singletonServices')!.logger
}

/**
 * In-memory SchedulerService implementation.
 * Uses CronJob for recurring tasks and setTimeout for delayed RPCs.
 */
export class InMemorySchedulerService extends SchedulerService {
  private cronJobs = new Map<string, CronJob>()
  private delayedTasks = new Map<string, DelayedTask>()
  private idCounter = 0

  async init(): Promise<void> {}

  /**
   * Schedule a one-off delayed RPC call via setTimeout
   */
  async scheduleRPC(
    delay: number | string,
    rpcName: string,
    data?: any,
    session?: CoreUserSession
  ): Promise<string> {
    const delayMs =
      typeof delay === 'string' ? parseDurationString(delay) : delay
    const taskId = `inmem-${++this.idCounter}-${Date.now()}`
    const scheduledFor = new Date(Date.now() + delayMs)

    const timer = setTimeout(async () => {
      this.delayedTasks.delete(taskId)
      try {
        // An RPC, not a cron task. `runScheduledTask` looks the name up in the
        // scheduler's task registry, which only ever holds wired cron tasks —
        // so every internally-scheduled RPC died here as
        // ScheduledTaskNotFoundError. The one that matters most is
        // `pikkuWorkflowSleeper`: it is registered by the workflow service as a
        // function, and it is what wakes a run from `workflow.sleep`. With the
        // wake-up lost to a swallowed log line, an async workflow run stopped
        // at its first sleep and stayed `running` forever.
        //
        // `data` has to be forwarded for the same reason. The sleeper is called
        // with `{ runId, stepId }` and cannot identify the sleeping step
        // without it — it was captured in `delayedTasks` but never passed on.
        // This matches what the BullMQ and pg-boss schedulers already do:
        // enqueue `{ rpcName, data, session }` and invoke the RPC with it.
        const services = getSingletonServices()
        const rpc = rpcService.getContextRPCService(
          services as any,
          {},
          false
        ) as { invoke: (name: string, data: unknown) => Promise<unknown> }
        await rpc.invoke(rpcName, data)
      } catch (err: unknown) {
        getLogger().error(`Failed to execute delayed RPC '${rpcName}': ${err}`)
      }
    }, delayMs)

    this.delayedTasks.set(taskId, {
      taskId,
      rpcName,
      data,
      session,
      scheduledFor,
      timer,
    })

    return taskId
  }

  async unschedule(taskId: string): Promise<boolean> {
    const task = this.delayedTasks.get(taskId)
    if (task) {
      clearTimeout(task.timer)
      this.delayedTasks.delete(taskId)
      return true
    }
    return false
  }

  async getTask(taskId: string): Promise<ScheduledTaskInfo | null> {
    const task = this.delayedTasks.get(taskId)
    if (!task) return null
    return {
      taskId: task.taskId,
      rpcName: task.rpcName,
      scheduledFor: task.scheduledFor,
      data: task.data,
      session: task.session,
      status: 'scheduled',
    }
  }

  async getAllTasks(): Promise<ScheduledTaskSummary[]> {
    return Array.from(this.delayedTasks.values()).map((t) => ({
      taskId: t.taskId,
      rpcName: t.rpcName,
      scheduledFor: t.scheduledFor,
    }))
  }

  async close(): Promise<void> {
    await this.stop()
    // Clear delayed tasks
    for (const [, task] of this.delayedTasks) {
      clearTimeout(task.timer)
    }
    this.delayedTasks.clear()
  }

  /**
   * Start recurring scheduled tasks.
   */
  async start(): Promise<void> {
    const scheduledTasks = getScheduledTasks()
    for (const [, task] of scheduledTasks) {
      this.startCronJob(task.name, task.schedule)
    }
  }

  /**
   * Stop all recurring CronJobs.
   */
  async stop(): Promise<void> {
    for (const [, job] of this.cronJobs) {
      job.stop()
    }
    this.cronJobs.clear()
  }

  private startCronJob(name: string, schedule: string) {
    const job = new CronJob(
      schedule,
      async () => {
        getLogger().info(`Running scheduled task: ${name}`)
        await runScheduledTask({ name })
        getLogger().debug(`Completed scheduled task: ${name}`)
      },
      null,
      true
    )
    this.cronJobs.set(name, job)
  }
}
