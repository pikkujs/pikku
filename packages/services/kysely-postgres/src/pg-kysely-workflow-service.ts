import { KyselyWorkflowService } from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import type { WorkflowQueueOptions } from '@pikku/core/workflow'
import type { Kysely } from 'kysely'
import { sql } from 'kysely'
import { jsonbText } from './jsonb.js'

/**
 * Fraction of `lockIdleTimeoutMs` between keepalives, so a heartbeat can be
 * lost or slow twice over and the session is still not reaped as idle.
 */
const LOCK_HEARTBEAT_DIVISOR = 3

/** Floor on the keepalive interval, so a small idle timeout cannot busy-poll. */
const MIN_LOCK_HEARTBEAT_MS = 1_000

/**
 * The run lock was held past `maxLockHoldMs` and taken back.
 *
 * Carries the run so the orchestrator log names the workflow that wedged
 * rather than only the lock.
 */
export class RunLockHoldTimeoutError extends Error {
  constructor(
    public readonly runId: string,
    public readonly heldForMs: number
  ) {
    super(
      `Workflow run ${runId} held its run lock for longer than ${heldForMs}ms and was released`
    )
    this.name = 'RunLockHoldTimeoutError'
  }
}

export interface PgWorkflowQueueOptions extends WorkflowQueueOptions {
  /**
   * A dedicated pool for the run lock, which is held for the whole workflow
   * body. Its size caps concurrent runs per process; size it above the deepest
   * chain of runs that start each other inline, or a parent waiting on a child
   * deadlocks. Every worker's lock pool must point at the same database —
   * `pg_advisory_lock` is database-scoped, so pools on different databases
   * never contend and the same run executes twice. Defaults to `db`.
   */
  lockDb?: Kysely<KyselyPikkuDB>
  /**
   * `lock_timeout` for the advisory lock, so a jam surfaces as a failed run.
   * `0` (the default) waits forever. Does not bound checking a connection out
   * of `lockDb` — that queue is the backpressure the pool exists to apply.
   */
  lockTimeoutMs?: number
  /**
   * Longest a workflow body may hold the run lock before the lock is taken
   * back and the caller rejected with `RunLockHoldTimeoutError`. `0` (the
   * default) is unbounded, which is the old behaviour: a body that never
   * settles holds its lock and its connection until the process dies, and
   * every later message for that run burns `lockTimeoutMs` waiting on it.
   *
   * Bounding it trades serialisation for liveness. The abandoned body keeps
   * running — a promise cannot be cancelled — so a second orchestration of the
   * run may overlap it. That is survivable because the run lock is not the
   * correctness boundary: `claimStepForExecution` is, and it already has to
   * hold against the duplicate dispatches the relay makes routinely. Set this
   * above the slowest legitimate body (a build, an LLM, a webhook round trip),
   * not above the average one.
   */
  maxLockHoldMs?: number
  /**
   * `idle_session_timeout` for the lock session, so Postgres reclaims a holder
   * that went away without closing its connection — a SIGKILLed container or a
   * partitioned worker, where the server sees a session that is simply idle
   * and keeps its advisory locks until TCP keepalives eventually notice.
   * Requires Postgres 14. `0` (the default) leaves the GUC alone.
   *
   * Only safe because of the keepalive below. A workflow body awaiting a build
   * for twenty minutes is *also* idle from the server's point of view, so
   * setting this on the pool by hand — in the connection string, or on the
   * role — reaps legitimate holders and hands the run to a second worker. The
   * option lives here so the two always ship together.
   */
  lockIdleTimeoutMs?: number
}

/**
 * Reads an optional millisecond option, rejecting values that would otherwise
 * reach Postgres as `SET lock_timeout = NaN`.
 */
const millis = (name: string, value: number | undefined): number => {
  const ms = value ?? 0
  if (!Number.isFinite(ms)) {
    throw new RangeError(`${name} must be a finite number of ms`)
  }
  return Math.max(0, Math.trunc(ms))
}

/**
 * Keeps the lock session non-idle while the body runs, so that a session
 * Postgres sees as idle means the holder is gone rather than merely slow.
 *
 * The comment rides along in the statement because `pg_stat_activity.query`
 * keeps the last one: an inherited lock leak is diagnosed by reading that
 * column, and `SELECT pg_advisory_lock($1)` sitting there is exactly the
 * evidence of a holder that stopped driving its connection.
 */
const startLockHeartbeat = (
  conn: Kysely<KyselyPikkuDB>,
  intervalMs: number
): { stop: () => Promise<void> } => {
  if (intervalMs <= 0) {
    return { stop: async () => {} }
  }
  // Serialised against itself so a slow keepalive cannot overlap the unlock
  // that follows it on the same connection.
  let inFlight: Promise<unknown> = Promise.resolve()
  const timer = setInterval(() => {
    inFlight = inFlight
      .then(() => sql`SELECT 1 /* pikku run lock heartbeat */`.execute(conn))
      // A keepalive that fails means the session is already gone, and the lock
      // with it. Releasing below reports that; there is nothing to do here.
      .catch(() => {})
  }, intervalMs)
  // A held lock must never be the reason a process stays alive.
  timer?.unref?.()
  return {
    stop: async () => {
      clearInterval(timer)
      await inFlight
    },
  }
}

/**
 * Runs the body, giving up on it after `maxHoldMs` so the lock can be released.
 *
 * Racing rather than cancelling is the whole of it: nothing can stop a promise
 * that will never settle, so the choice is between abandoning the body and
 * leaking the lock behind it forever.
 */
const withHoldBound = async <T>(
  runId: string,
  fn: () => Promise<T>,
  maxHoldMs: number
): Promise<T> => {
  if (maxHoldMs <= 0) {
    return fn()
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_resolve, reject) => {
        // Deliberately not unref'd: this timer firing is the recovery, so it
        // has to outlive an event loop that has nothing else left to do.
        timer = setTimeout(
          () => reject(new RunLockHoldTimeoutError(runId, maxHoldMs)),
          maxHoldMs
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Releases the run lock, and kills the session rather than let a connection go
 * back to the pool still holding it.
 *
 * A session lock outlives the statement that failed to release it, so an
 * unlock that throws is the one way this shape leaks a lock while the process
 * is still healthy: the pooled connection is handed to the next caller, the
 * lock stays taken, and every acquirer of that run blocks until it times out.
 * Terminating our own backend is the reliable release — Postgres drops every
 * session lock with the session, and the driver discards a connection whose
 * backend is gone.
 *
 * Returns false when it came to that, so the caller stops issuing on a session
 * that no longer exists.
 */
const releaseRunLock = async (
  conn: Kysely<KyselyPikkuDB>,
  lockId: number
): Promise<boolean> => {
  try {
    await sql`SELECT pg_advisory_unlock(${lockId})`.execute(conn)
    return true
  } catch {
    try {
      await sql`SELECT pg_terminate_backend(pg_backend_pid())`.execute(conn)
    } catch {
      // The connection is already unusable, which releases the lock too.
    }
    return false
  }
}

export class PgKyselyWorkflowService extends KyselyWorkflowService {
  private lockDb: Kysely<KyselyPikkuDB>
  private lockTimeoutMs: number
  private maxLockHoldMs: number
  private lockIdleTimeoutMs: number
  private lockHeartbeatMs: number

  constructor(db: Kysely<KyselyPikkuDB>, options: PgWorkflowQueueOptions = {}) {
    super(db, options)
    this.lockDb = options.lockDb ?? db
    this.lockTimeoutMs = millis('lockTimeoutMs', options.lockTimeoutMs)
    this.maxLockHoldMs = millis('maxLockHoldMs', options.maxLockHoldMs)
    this.lockIdleTimeoutMs = millis(
      'lockIdleTimeoutMs',
      options.lockIdleTimeoutMs
    )
    this.lockHeartbeatMs =
      this.lockIdleTimeoutMs > 0
        ? Math.max(
            MIN_LOCK_HEARTBEAT_MS,
            Math.floor(this.lockIdleTimeoutMs / LOCK_HEARTBEAT_DIVISOR)
          )
        : 0
  }

  /**
   * Postgres has no `json_set`. The column is text, so it is cast to jsonb for
   * the merge and back afterwards; `||` is used rather than `jsonb_set` because
   * `jsonb_set` will not create a key that is not already present.
   *
   * `jsonbText` is what carries the value safely across drivers — see its own
   * documentation for why a bare `$1::jsonb` would arrive double-encoded.
   */
  protected override jsonSetState(path: string, json: string) {
    // The base builds `$."key"`; Postgres addresses jsonb keys by bare name.
    const key = JSON.parse(path.slice(2))
    return sql<string>`(coalesce(state, '{}')::jsonb || jsonb_build_object(${key}::text, ${jsonbText(json)}))::text`
  }

  private hashStringToInt(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash |= 0
    }
    return hash
  }

  /**
   * A session lock, not a transaction one: the critical section is the whole
   * workflow body, so it may await a build, an LLM or a webhook for minutes.
   * Under `pg_advisory_xact_lock` that left the connection `idle in
   * transaction` for the duration — an xid Postgres cannot vacuum past, and a
   * shape that turns one wedged run into a pool outage. `pg_advisory_lock`
   * holds the same lock without an open transaction; the session still dies
   * with the connection, so a crashed holder still releases.
   *
   * What a session lock does not give for free is a bound. Nothing reclaims it
   * while the process lives, so a body that never settles keeps its lock and
   * its connection forever, and every later message for that run pays
   * `lockTimeoutMs` before failing — enough of them and the whole worker pool
   * is queued behind runs that will never finish. The three guards below are
   * the bound the primitive lacks, and each answers a different way to lose a
   * holder: `maxLockHoldMs` for a body that hangs in-process, the keepalive
   * plus `idle_session_timeout` for a holder that vanished without closing its
   * connection, and `releaseRunLock` for an unlock that fails on the way out.
   * All are off by default; a deployment that wants the guarantee opts in.
   *
   * They are a backstop, not the cure. Cheaper by far is not to enter the
   * critical section for a run that cannot move — which is what `isRunSettled`
   * in `@pikku/core` now does, and what every leaked lock observed in
   * production turned out to need.
   *
   * `lock_timeout` is set and reset rather than `SET LOCAL`, which only exists
   * inside a transaction, and the reset is what stops the setting from riding
   * the connection back into the pool.
   */
  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const lockId = this.hashStringToInt(`run:${id}`)
    return this.lockDb.connection().execute(async (conn) => {
      let sessionAlive = true
      try {
        if (this.lockTimeoutMs > 0) {
          await sql
            .raw(`SET lock_timeout = ${this.lockTimeoutMs}`)
            .execute(conn)
        }
        if (this.lockIdleTimeoutMs > 0) {
          await sql
            .raw(`SET idle_session_timeout = ${this.lockIdleTimeoutMs}`)
            .execute(conn)
        }
        await sql`SELECT pg_advisory_lock(${lockId})`.execute(conn)
        const heartbeat = startLockHeartbeat(conn, this.lockHeartbeatMs)
        try {
          return await withHoldBound(id, fn, this.maxLockHoldMs)
        } finally {
          await heartbeat.stop()
          sessionAlive = await releaseRunLock(conn, lockId)
        }
      } finally {
        // Nothing is left to reset on a session that had to be terminated, and
        // issuing on it would only replace the body's outcome with a
        // connection error.
        if (sessionAlive) {
          if (this.lockTimeoutMs > 0) {
            await sql.raw('RESET lock_timeout').execute(conn)
          }
          if (this.lockIdleTimeoutMs > 0) {
            await sql.raw('RESET idle_session_timeout').execute(conn)
          }
        }
      }
    })
  }

  /**
   * Stays on the query pool: the caller claims the step under this lock and
   * runs it outside, so the connection is held for a few statements.
   */
  async withStepLock<T>(
    runId: string,
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const lockId = this.hashStringToInt(`step:${runId}:${stepName}`)
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(${lockId})`.execute(trx)
      return fn()
    })
  }
}
