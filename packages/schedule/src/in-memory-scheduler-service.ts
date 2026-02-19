import { CronJob } from 'cron'
import {
  parseVersionedId,
  pikkuState,
  runScheduledTask,
  CoreUserSession,
  SchedulerService,
  ScheduledTaskInfo,
  ScheduledTaskSummary,
  parseDurationString,
} from '@pikku/core'
import { getScheduledTasks } from '@pikku/core/scheduler'
import type { RunFunction } from '@pikku/core/function'
import type { Logger } from '@pikku/core/services'
import { PikkuSessionService } from '@pikku/core/services'

interface DelayedTask {
  taskId: string
  rpcName: string
  data?: any
  session?: CoreUserSession
  scheduledFor: Date
  timer: ReturnType<typeof setTimeout>
}

/**
 * In-memory SchedulerService implementation.
 * Uses CronJob for recurring tasks and setTimeout for delayed RPCs.
 */
export class InMemorySchedulerService extends SchedulerService {
  private cronJobs = new Map<string, CronJob>()
  private delayedTasks = new Map<string, DelayedTask>()
  private idCounter = 0
  private runFunction?: RunFunction
  constructor(private logger: Logger) {
    super()
  }

  /**
   * Set services needed for processing recurring tasks.
   * Must be called before start() since the scheduler is typically
   * created before singletonServices are available.
   */
  setPikkuFunctionRunner(runFunction: RunFunction): void {
    this.runFunction = runFunction
  }

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
    if (!this.runFunction) {
      throw new Error(
        'InMemorySchedulerService requires setPikkuFunctionRunner() before scheduling RPCs'
      )
    }

    const delayMs =
      typeof delay === 'string' ? parseDurationString(delay) : delay
    const taskId = `inmem-${++this.idCounter}-${Date.now()}`
    const scheduledFor = new Date(Date.now() + delayMs)

    const timer = setTimeout(async () => {
      this.delayedTasks.delete(taskId)
      try {
        const sessionService = new PikkuSessionService()
        if (session) {
          sessionService.set(session)
        }
        await this.runFunction!(
          'rpc',
          rpcName,
          this.resolveRpcFunctionId(rpcName),
          {
            auth: false,
            data: () => data,
            sessionService,
          }
        )
      } catch (err: unknown) {
        this.logger!.error(`Failed to execute delayed RPC '${rpcName}': ${err}`)
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
    if (!this.runFunction) {
      throw new Error(
        'InMemorySchedulerService requires setPikkuFunctionRunner() before start()'
      )
    }

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
        this.logger!.info(`Running scheduled task: ${name}`)
        await runScheduledTask({
          name,
          runFunction: this.runFunction!,
          logger: this.logger!,
        })
        this.logger!.debug(`Completed scheduled task: ${name}`)
      },
      null,
      true
    )
    this.cronJobs.set(name, job)
  }

  private resolveRpcFunctionId(rpcName: string): string {
    const rpcMeta = pikkuState(null, 'rpc', 'meta')
    let funcId = rpcMeta[rpcName]
    if (!funcId) {
      const { baseName, version } = parseVersionedId(rpcName)
      if (version !== null) {
        funcId = rpcMeta[baseName]
      }
    }
    if (!funcId) {
      throw new Error(`RPC function not found: ${rpcName}`)
    }
    return funcId
  }
}
