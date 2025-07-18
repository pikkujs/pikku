import { CronJob } from 'cron'
import {
  CoreAPIFunctionSessionless,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CreateSessionServices,
} from '@pikku/core'
import {
  runScheduledTask,
  CoreScheduledTask,
  getScheduledTasks,
} from '@pikku/core/scheduler'

export class PikkuTaskScheduler<TaskName extends string> {
  private jobs = new Map<string, CronJob>()

  constructor(
    private singletonServices: CoreSingletonServices,
    private createSessionServices?: CreateSessionServices<
      CoreSingletonServices,
      CoreServices,
      CoreUserSession
    >
  ) {}

  public startAll() {
    const scheduledTasks = getScheduledTasks()
    scheduledTasks.forEach((task) => this.startJobSchedule(task))
  }

  public stopAll() {
    this.jobs.forEach((job) => job.stop())
    this.jobs.clear()
  }

  public start(names: TaskName[]) {
    const scheduledTasks = getScheduledTasks()
    for (const name of names) {
      const task = scheduledTasks.get(name)
      if (task) {
        this.startJobSchedule(task)
      }
    }
  }

  public stop(names: TaskName[]) {
    for (const name of names) {
      const job = this.jobs.get(name)
      if (job) {
        job.stop()
        this.jobs.delete(name)
      }
    }
  }

  private startJobSchedule(
    task: CoreScheduledTask<CoreAPIFunctionSessionless<void, void>>
  ) {
    const job = new CronJob(
      task.schedule,
      async () => {
        this.singletonServices.logger.info(
          `Running scheduled task: ${task.name}`
        )
        await runScheduledTask({
          singletonServices: this.singletonServices,
          createSessionServices: this.createSessionServices as any,
          name: task.name,
        })
        this.singletonServices.logger.debug(
          `Completed scheduled task: ${task.name}`
        )
      },
      null,
      true
    )
    this.jobs.set(task.name, job)
  }
}
