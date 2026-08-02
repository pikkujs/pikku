import type { DispositionProfile } from './virtual-user-dispositions.js'
import type { VirtualUserRng } from './virtual-user-rng.js'
import type {
  IntentRecord,
  IntentSource,
  IntentStatus,
} from './virtual-user.types.js'

/** One intent as the stack tracks it. */
interface TrackedIntent {
  id: string
  source: IntentSource
  status: IntentStatus
  steps: number[]
  suspensions: number
  summary?: string
}

/** The move the scheduler rolled for a tick. */
export type IntentMove = 'start' | 'continue' | 'suspend' | 'resume' | 'abandon'

/** What the stack scheduled: which intent is active, and how it got there. */
export interface ScheduledTick {
  intent: TrackedIntent
  move: IntentMove
}

/**
 * The stack of things this user is in the middle of — and the whole of the
 * engine's randomness.
 *
 * A real person does not run a flow end to end: they start something, get
 * pulled away, do a bit of something else, come back to a world that moved
 * underneath them, and sometimes never come back at all. Modelling that as a
 * stack of partially-completed intents is what produces the bugs worth having —
 * half-mutated state, a flow resumed against changed data, an invite accepted
 * after the plan changed — none of which a scripted scenario can reach.
 *
 * Scheduling is the engine's job and the model's turns are not: the model
 * decides what to do *within* the active intent, the stack decides which intent
 * that is. Keeping the split there is what makes a run reproducible from a seed
 * while the work inside it stays free.
 *
 * A feature is only where an intent comes from. Nothing here tracks whether one
 * was "completed correctly", and the model is never told an intent boundary
 * exists.
 */
export class IntentStack {
  private readonly tracked: TrackedIntent[] = []
  private readonly unstarted: IntentSource[]
  private active: TrackedIntent | null = null
  private counter = 0

  constructor(
    sources: readonly IntentSource[],
    private readonly rng: VirtualUserRng,
    private readonly profile: DispositionProfile,
    /** Cap on intents open at once, so a distractible user still finishes things. */
    private readonly maxOpen = 3
  ) {
    this.unstarted = [...sources]
  }

  /**
   * Pick the intent for this tick, or `null` when there is nothing left to do.
   *
   * The first tick always starts something; after that the four moves are
   * weighted by the disposition, and a move that has nowhere to go degrades to
   * `continue` rather than stalling the run.
   */
  next(step: number): ScheduledTick | null {
    if (!this.active) {
      const started = this.startOrResume()
      if (!started) return null
      started.steps.push(step)
      this.active = started
      return { intent: started, move: 'start' }
    }

    const move = this.rng.weighted(this.profile.moves) ?? 'continue'
    if (move === 'continue') {
      this.active.steps.push(step)
      return { intent: this.active, move: 'continue' }
    }

    const current = this.active
    if (move === 'abandon') {
      current.status = 'abandoned'
    } else {
      current.status = 'suspended'
      current.suspensions++
    }
    this.active = null

    const next =
      move === 'resume' ? this.resumeSuspended() : this.startOrResume(current)
    if (!next) {
      // Nowhere to go: keep working on what we had rather than ending a run
      // early. An abandoned intent stays abandoned — that decision stands.
      if (current.status === 'abandoned') return null
      current.status = 'open'
      current.suspensions--
      current.steps.push(step)
      this.active = current
      return { intent: current, move: 'continue' }
    }

    next.status = 'open'
    next.steps.push(step)
    this.active = next
    return { intent: next, move }
  }

  /** Mark the active intent finished; the next tick schedules something else. */
  complete(summary?: string): void {
    if (!this.active) return
    this.active.status = 'completed'
    this.active.summary = summary
    this.active = null
  }

  /** Mark the active intent as one the user could not get through. */
  stuck(reason?: string): void {
    if (!this.active) return
    this.active.status = 'stuck'
    this.active.summary = reason
    this.active = null
  }

  /** Every intent the run touched, in the order it first opened them. */
  records(): IntentRecord[] {
    return this.tracked.map((intent) => ({
      id: intent.id,
      sourceId: intent.source.id,
      title: intent.source.title,
      status: intent.status,
      steps: [...intent.steps],
      suspensions: intent.suspensions,
      summary: intent.summary,
    }))
  }

  /** Prefer opening something new, falling back to picking a suspended one up. */
  private startOrResume(exclude?: TrackedIntent): TrackedIntent | null {
    const openCount = this.tracked.filter(
      (intent) => intent.status === 'open' || intent.status === 'suspended'
    ).length
    if (this.unstarted.length > 0 && openCount < this.maxOpen) {
      const source = this.rng.pick(this.unstarted)!
      this.unstarted.splice(this.unstarted.indexOf(source), 1)
      const intent: TrackedIntent = {
        id: `intent_${++this.counter}`,
        source,
        status: 'open',
        steps: [],
        suspensions: 0,
      }
      this.tracked.push(intent)
      return intent
    }
    return this.resumeSuspended(exclude)
  }

  private resumeSuspended(exclude?: TrackedIntent): TrackedIntent | null {
    const suspended = this.tracked.filter(
      (intent) => intent.status === 'suspended' && intent !== exclude
    )
    return this.rng.pick(suspended) ?? null
  }
}

/**
 * The intents a persona may be given: those whose source names them, plus every
 * source that names nobody.
 *
 * This is a free lookup rather than new authoring — scenario meta already
 * records which personas each scenario runs as.
 */
export const intentsForPersona = (
  sources: readonly IntentSource[],
  personaId: string
): IntentSource[] =>
  sources.filter(
    (source) => !source.personas?.length || source.personas.includes(personaId)
  )
