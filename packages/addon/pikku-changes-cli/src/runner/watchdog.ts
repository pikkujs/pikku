import type { AgentRun } from './types.js'

/** When an agent last did anything, and the tools it has running by id with when each started. */
export class AgentWatch {
  lastActivity: number
  readonly tools = new Map<string, number>()

  constructor(
    run: AgentRun,
    private now: () => number
  ) {
    this.lastActivity = now()
    run.onActivity((activity) => {
      this.lastActivity = this.now()
      if (activity.type === 'tool_start')
        this.tools.set(activity.id, this.now())
      else if (activity.type === 'tool_end') this.tools.delete(activity.id)
    })
  }

  /** After a stop: the agent is not judged again until it is quiet once more. */
  reset() {
    this.lastActivity = this.now()
    this.tools.clear()
  }
}

/**
 * Why an agent is stuck, or null: quiet for `quietMs` with no tool running (a
 * dropped connection, a provider backing off), or one tool running for
 * `toolMaxMs`. Either limit at 0 is off.
 */
export const stallOf = (
  watch: AgentWatch,
  now: number,
  quietMs: number,
  toolMaxMs: number
): string | null => {
  if (watch.tools.size) {
    const oldest = Math.min(...watch.tools.values())
    return toolMaxMs > 0 && now - oldest >= toolMaxMs
      ? `had one tool running for ${Math.round((now - oldest) / 60_000)} minutes (the limit is ${toolMaxMs / 60_000}, set by the toolMaxMinutes option), so it was stopped with what it started`
      : null
  }
  return quietMs > 0 && now - watch.lastActivity >= quietMs
    ? `went quiet for ${Math.round(quietMs / 60_000)} minutes with nothing running (the limit is ${quietMs / 60_000}, set by the stallMinutes option), so it was stopped`
    : null
}

/** How often the watchdog looks: half the shortest limit, between 50 ms and 30 s. */
export const watchInterval = (quietMs: number, toolMaxMs: number): number => {
  const limits = [quietMs, toolMaxMs].filter((n) => n > 0)
  return limits.length
    ? Math.min(30_000, Math.max(50, Math.min(...limits) / 2))
    : 30_000
}
