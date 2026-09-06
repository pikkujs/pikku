import type { JetStreamClient, JetStreamManager, JsMsg } from '@nats-io/jetstream'
import { AckPolicy, DeliverPolicy } from '@nats-io/jetstream'
import { headers } from '@nats-io/nats-core'
import type { CoreUserSession } from '@pikku/core/types'
import type { ScheduledTaskInfo, ScheduledTaskSummary } from '@pikku/core/services'
import { SchedulerService } from '@pikku/core/services'
import { parseDurationString } from '@pikku/core/utils'
import { pikkuState } from '@pikku/core/state'
import { getScheduledTasks, runScheduledTask } from '@pikku/core/scheduler'
import { consumeQueue, type ConsumeHandle } from './consume.js'
import {
  SCHEDULE_HEADER,
  SCHEDULE_TARGET_HEADER,
  SCHEDULE_SUBJECT_SEGMENT,
  queueNameToToken,
  scheduleSubjectFor,
  subjectForQueue,
} from './utils.js'

/** Payload of a scheduled job, matching what PgBossSchedulerService stored. */
interface ScheduledJobData {
  rpcName: string
  data?: any
  session?: CoreUserSession
}

/**
 * Queue recurring cron fires land on.
 *
 * Deliberately separate from `pikku-remote-internal-rpc` (where one-off
 * `scheduleRPC` calls land): that queue is a registered pikku worker whose
 * consumer is owned by the queue registry, and a recurring task is not an RPC
 * invocation — it goes through `runScheduledTask`, which resolves the task's
 * own wiring, middleware and session. Sharing one queue would mean one handler
 * having to guess which of the two a message was.
 */
const RECURRING_TASK_QUEUE = 'pikku-recurring-scheduled-task'

/** Queue a one-off `scheduleRPC` fires onto — a registered pikku worker. */
const REMOTE_RPC_QUEUE = 'pikku-remote-internal-rpc'

/** Concurrent in-flight scheduled tasks. */
const RECURRING_MAX_ACK_PENDING = 5

/** Ack window for a recurring fire. Generous: recurring tasks are batch
 *  jobs (key rotation, data enrichment), not request-shaped work. */
const RECURRING_ACK_WAIT_NS = 15 * 60_000 * 1_000_000

/**
 * Translate a 5-field crontab expression into the 6-field form NATS requires.
 *
 * NATS cron is seconds-first and rejects anything that is not exactly 6 fields.
 * Pikku's `wireScheduler` schedules are ordinary 5-field crontab, so the
 * leading `0` is added here rather than pushed onto every task definition.
 */
export const toNatsCron = (cronExpr: string): string => {
  const fields = cronExpr.trim().split(/\s+/)
  return fields.length === 5 ? `0 ${fields.join(' ')}` : cronExpr.trim()
}

/**
 * Scheduler backed by JetStream's own message scheduler (server 2.14+).
 *
 * Mirrors `PgBossSchedulerService`, with the schedules living in the broker
 * instead of a `pgboss.schedule` table. A schedule *is* a retained message on a
 * reserved subject: publishing registers it, republishing to the same subject
 * replaces it, and purging the subject cancels it. The server then produces the
 * message body onto `Nats-Schedule-Target` on each occurrence, where an
 * ordinary consumer picks it up.
 *
 * Two behaviours differ from a database-backed scheduler, both deliberate:
 *
 *  - A missed occurrence is skipped, not caught up. This matches pg-boss, whose
 *    cron monitor only fires a schedule whose previous occurrence is under a
 *    minute old — so an instance that was down over an occurrence has always
 *    dropped it rather than replaying it.
 *  - There is no job history. A WorkQueue stream deletes a message on ack, so
 *    "did this task run" comes from telemetry, not from the broker.
 */
export class NatsSchedulerService extends SchedulerService {
  private consumer?: ConsumeHandle

  constructor(
    private readonly js: JetStreamClient,
    private readonly jsm: JetStreamManager,
    private readonly streamName: string,
    private readonly subjectPrefix: string,
  ) {
    super()
  }

  /** No-op: the connection and stream are owned by NatsServiceFactory. */
  async init(): Promise<void> {}

  /**
   * Schedule a one-off delayed RPC.
   *
   * The returned task id is the schedule's own subject, which is what makes
   * `unschedule` and `getTask` exact — there is no id to look up, the subject
   * *is* the handle. `@at` schedules are purged by the server once they fire,
   * so a fired task simply stops being findable.
   */
  async scheduleRPC(
    delay: number | string,
    rpcName: string,
    data?: any,
    session?: CoreUserSession,
  ): Promise<string> {
    const delayMs = typeof delay === 'string' ? parseDurationString(delay) : delay
    const subject = scheduleSubjectFor(this.subjectPrefix, REMOTE_RPC_QUEUE)
    const hdrs = headers()
    // A timestamp already in the past fires immediately rather than erroring,
    // which matches pg-boss's `startAfter` with an elapsed date.
    hdrs.set(SCHEDULE_HEADER, `@at ${new Date(Date.now() + delayMs).toISOString()}`)
    hdrs.set(SCHEDULE_TARGET_HEADER, subjectForQueue(this.subjectPrefix, REMOTE_RPC_QUEUE))
    await this.js.publish(
      subject,
      JSON.stringify({ rpcName, data, session } satisfies ScheduledJobData),
      { headers: hdrs },
    )
    return subject
  }

  /**
   * Cancel a scheduled task. Idempotent — purging a subject that holds no
   * message is not an error, so cancelling a task that already fired returns
   * false rather than throwing.
   */
  async unschedule(taskId: string): Promise<boolean> {
    if (!this.ownsSubject(taskId)) return false
    const res = await this.jsm.streams.purge(this.streamName, { filter: taskId })
    return (res.purged ?? 0) > 0
  }

  async getTask(taskId: string): Promise<ScheduledTaskInfo | null> {
    if (!this.ownsSubject(taskId)) return null
    let msg
    try {
      msg = await this.jsm.streams.getMessage(this.streamName, { last_by_subj: taskId })
    } catch {
      // 10037 "no message found" — an unknown or already-fired task.
      return null
    }
    if (!msg) return null
    const jobData = JSON.parse(new TextDecoder().decode(msg.data)) as ScheduledJobData
    return {
      taskId,
      rpcName: jobData.rpcName,
      scheduledFor: nextFireFrom(msg.header.get(SCHEDULE_HEADER)) ?? msg.time,
      data: jobData.data,
      session: jobData.session,
      status: 'scheduled',
    }
  }

  /**
   * List every schedule this service owns.
   *
   * Unlike the pg-boss implementation — which returned an empty array because
   * pg-boss has no cheap way to enumerate pending jobs — this is exact: the
   * stream's subject list *is* the set of live schedules, so one
   * `subjects_filter` call answers it. That listing is also what prunes
   * orphans in `start()`.
   */
  async getAllTasks(): Promise<ScheduledTaskSummary[]> {
    const subjects = await this.scheduleSubjects()
    const tasks: ScheduledTaskSummary[] = []
    for (const subject of subjects) {
      const task = await this.getTask(subject)
      if (task) tasks.push(task)
    }
    return tasks
  }

  /** No-op: the connection is owned by NatsServiceFactory. */
  async close(): Promise<void> {}

  /**
   * Register every code-declared recurring task with the broker and start
   * consuming their fires.
   *
   * Rewriting all schedules on every boot is the point, not waste: a schedule
   * lives in the broker and the code is the only source of truth for what
   * should exist, so republishing reconciles a changed cron expression, and the
   * prune below reconciles a deleted task. Without the prune a task removed
   * from code would keep firing forever onto a queue whose handler no longer
   * recognises it — the NATS-side version of the pg-boss bug where a removed
   * task flooded a queue with stuck jobs.
   */
  async start(): Promise<void> {
    const logger = pikkuState(null, 'package', 'singletonServices')!.logger
    const scheduledTasks = getScheduledTasks()

    this.consumer = await consumeQueue({
      js: this.js,
      jsm: this.jsm,
      streamName: this.streamName,
      subjectPrefix: this.subjectPrefix,
      queueName: RECURRING_TASK_QUEUE,
      config: {
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        max_ack_pending: RECURRING_MAX_ACK_PENDING,
        ack_wait: RECURRING_ACK_WAIT_NS,
      },
      handler: (msg) => this.runFire(msg),
      logger,
    })

    const expected = new Set<string>()
    for (const [name, task] of scheduledTasks) {
      const subject = this.recurringSubjectFor(name)
      expected.add(subject)
      const hdrs = headers()
      hdrs.set(SCHEDULE_HEADER, toNatsCron(task.schedule))
      hdrs.set(SCHEDULE_TARGET_HEADER, subjectForQueue(this.subjectPrefix, RECURRING_TASK_QUEUE))
      try {
        await this.js.publish(
          subject,
          JSON.stringify({ rpcName: name } satisfies ScheduledJobData),
          { headers: hdrs },
        )
      } catch (err) {
        // One bad cron expression must not take every other task down with it.
        logger.error(
          `Failed to schedule ${name} (${task.schedule}): ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    try {
      for (const subject of await this.scheduleSubjects(RECURRING_TASK_QUEUE)) {
        if (expected.has(subject)) continue
        await this.jsm.streams.purge(this.streamName, { filter: subject })
        logger.warn(`Pruned orphaned scheduled task: ${subject}`)
      }
    } catch (err) {
      logger.warn(
        `Failed to prune orphaned scheduled tasks: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * Deregister every recurring schedule and drop the fires already queued.
   *
   * A runner that drives crons some other way has to call this, because a
   * schedule lives in the broker rather than in the process: one left behind by
   * an earlier deployment keeps firing on time into a queue nothing consumes,
   * and on a work-queue stream those fires are never reclaimed. `start()`
   * re-registers everything it owns, so a runner that does drive crons here can
   * call this first at no cost.
   */
  async pruneAll(): Promise<number> {
    const subjects = await this.scheduleSubjects(RECURRING_TASK_QUEUE)
    for (const subject of subjects) {
      await this.jsm.streams.purge(this.streamName, { filter: subject })
    }
    await this.jsm.streams.purge(this.streamName, {
      filter: subjectForQueue(this.subjectPrefix, RECURRING_TASK_QUEUE),
    })
    return subjects.length
  }

  /**
   * Stop consuming fires, leaving the schedules registered.
   *
   * Deliberately not symmetric with `start()`: the pg-boss implementation
   * unscheduled everything on stop, which meant a rolling deploy briefly had no
   * schedules at all and any occurrence in that window was lost. Schedules are
   * shared state that outlive one instance; only the consumer is per-instance.
   */
  async stop(): Promise<void> {
    this.consumer?.stop()
    this.consumer = undefined
  }

  /** Run one recurring fire. Owns the message's terminal call — `consumeQueue`
   *  launches handlers without awaiting them, so it cannot ack on their behalf. */
  private async runFire(msg: JsMsg): Promise<void> {
    const logger = pikkuState(null, 'package', 'singletonServices')!.logger
    let rpcName: string | undefined
    try {
      rpcName = msg.json<ScheduledJobData>()?.rpcName
      if (!rpcName) {
        logger.error(`Malformed scheduled task fire ${msg.seq} (no rpcName)`)
        msg.term()
        return
      }
      logger.info(`Running scheduled task: ${rpcName}`)
      await runScheduledTask({ name: rpcName })
      msg.ack()
    } catch (err) {
      // Terminal rather than retried: the next occurrence is already scheduled,
      // and a cron task that failed is far more often wrong-in-code than
      // unlucky. Redelivering would also let a slow-failing task stack up
      // against the next fire, running two copies of work that assumed it was
      // the only one.
      logger.error(`Scheduled task ${rpcName ?? msg.seq} failed: ${err}`)
      msg.term()
    }
  }

  /** Stable schedule subject for a code-declared recurring task. */
  private recurringSubjectFor(taskName: string): string {
    return scheduleSubjectFor(this.subjectPrefix, RECURRING_TASK_QUEUE, taskName)
  }

  /** Guards against a caller passing an id from some other scheduler, which
   *  would otherwise purge an arbitrary subject in this stream. */
  private ownsSubject(subject: string): boolean {
    return subject.startsWith(`${this.subjectPrefix}.${SCHEDULE_SUBJECT_SEGMENT}.`)
  }

  /**
   * Subjects currently holding a schedule, optionally narrowed to one queue.
   * `subjects_filter` makes the server return its per-subject message counts,
   * which for schedule subjects is exactly the live schedule set.
   */
  private async scheduleSubjects(queueName?: string): Promise<string[]> {
    const filter = queueName
      ? `${this.subjectPrefix}.${SCHEDULE_SUBJECT_SEGMENT}.${queueNameToToken(queueName)}.>`
      : `${this.subjectPrefix}.${SCHEDULE_SUBJECT_SEGMENT}.>`
    const info = await this.jsm.streams.info(this.streamName, { subjects_filter: filter })
    return Object.keys(info.state.subjects ?? {})
  }
}

/**
 * Best-effort "when does this fire next" for `getTask`.
 *
 * Only `@at` is answerable without a cron parser, and that is the case that
 * matters: `scheduleRPC` returns those ids, and a recurring task's next
 * occurrence is better read from the server's own `Nats-Schedule-Next` on the
 * produced message than recomputed here.
 */
const nextFireFrom = (schedule: string | undefined): Date | undefined => {
  if (!schedule?.startsWith('@at ')) return undefined
  const parsed = new Date(schedule.slice(4).trim())
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}
