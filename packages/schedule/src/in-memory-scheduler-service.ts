import { CronJob } from 'cron'
import {
  CoreUserSession,
  SchedulerService,
  ScheduledTaskInfo,
  ScheduledTaskSummary,
  parseDurationString,
  pikkuState,
} from '@pikku/core'
import { runScheduledTask, getScheduledTasks } from '@pikku/core/scheduler'

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
        await runScheduledTask({ name: rpcName, session })
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
