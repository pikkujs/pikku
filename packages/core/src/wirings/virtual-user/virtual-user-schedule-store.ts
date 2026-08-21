import type {
  VirtualUserBudget,
  VirtualUserDisposition,
} from './virtual-user.types.js'

/**
 * One persona's standing instruction to keep using the app.
 *
 * A virtual user that runs once tells you about one afternoon. What an app
 * actually wants to know is what a persona hits over a fortnight, and that is
 * a cadence, not a longer run — a budget already caps how far a single run
 * goes, and raising it only buys a more tired user.
 *
 * The row is the schedule. There is deliberately no timer, interval or
 * in-memory loop anywhere near it: a process that holds the next run in its own
 * heap forgets it on the next deploy, and a persona silently stops. Something
 * outside asks which rows are due; the answer survives restarts because it is
 * written down.
 */
export interface VirtualUserScheduleRecord {
  persona: string
  /**
   * Off by default. A schedule that ran the moment it was written would start
   * spending an app's model budget as a side effect of a migration.
   */
  enabled: boolean
  disposition: VirtualUserDisposition
  goals: string[]
  budget: VirtualUserBudget | null
  /**
   * The gap to the next run is drawn between these, not fixed. A persona that
   * appears at exactly 09:00 every day exercises one cache state and one cron
   * neighbourhood; a real one does not keep an appointment.
   */
  minIntervalMs: number
  maxIntervalMs: number
  /** When this persona is next allowed to run. The whole schedule, in one field. */
  nextRunAt: Date
  lastRunId: string | null
  lastRunAt: Date | null
}

/** A partial write — anything left out keeps whatever the row already had. */
export interface VirtualUserScheduleInput {
  persona: string
  enabled?: boolean
  disposition?: VirtualUserDisposition
  goals?: readonly string[]
  budget?: VirtualUserBudget | null
  minIntervalMs?: number
  maxIntervalMs?: number
  nextRunAt?: Date
}

/**
 * Where cadences are kept, alongside {@link VirtualUserRunStore} and separate
 * from it: a host can want the history of runs it started by hand without
 * wanting unattended ones, and wiring nothing is how it says so.
 *
 * SECURITY: writing a row here spends money on every future tick, without a
 * caller present to see it happen. The scaffold gates writes behind a scope of
 * their own for that reason — reading what the virtual users found is a much
 * smaller permission than deciding they should keep going.
 */
export interface VirtualUserScheduleStore {
  /** Creates or updates one persona's cadence. Returns the row as it now stands. */
  set(schedule: VirtualUserScheduleInput): Promise<VirtualUserScheduleRecord>
  get(persona: string): Promise<VirtualUserScheduleRecord | null>
  list(): Promise<VirtualUserScheduleRecord[]>
  /** Enabled rows whose `nextRunAt` has passed. */
  due(now: Date): Promise<VirtualUserScheduleRecord[]>
  /**
   * Pushes the persona's next run out, and records which run this was.
   *
   * Called *before* the run is dispatched, so a tick that dies halfway does not
   * leave a row due and get re-dispatched by the next one. The cost is that a
   * dispatch which throws waits a full interval rather than retrying, which is
   * the right way round: a persona that is failing to start should not be
   * retried every minute for a week.
   */
  claim(
    persona: string,
    claim: { nextRunAt: Date; runId: string | null; at: Date }
  ): Promise<void>
  remove(persona: string): Promise<void>
}
