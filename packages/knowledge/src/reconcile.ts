import { z } from 'zod'
import { attemptsSpent } from './ledger.js'
import { readMilestones, type MilestoneNote } from './milestone.js'
import {
  readyMilestone,
  type MilestoneGate,
  type MilestoneReadiness,
} from './milestone-gate.js'
import type { KnowledgeNote } from './notes.js'
import {
  KnowledgeQuestionSchema,
  askFreely,
  type KnowledgeQuestion,
} from './question.js'
import { readPlan } from './plan.js'

/**
 * What the pipeline should do next, derived entirely from what is on disk.
 *
 * This is the whole control plane, and it is a pure read for a reason. The shape it
 * replaces is edge-triggered: each stage tells the next one through a sentinel beside
 * the work, armed only from inside a "a turn just ended" callback, so every condition
 * needs its own branch remembering to start a turn — and every branch that forgets is a
 * run that comes to rest looking busy. Deriving the answer instead means calling this
 * twice is free, nothing has to be armed, and a state nobody anticipated is a missing
 * row here rather than a stall in production.
 *
 * It also means the pipeline is testable in a temp directory: write the notes, assert
 * the action. Every failure this was written against — a milestone blocked on an
 * agreement nobody could give, a plan budget that ran out in silence, a dispatch
 * waiting on a plan that was never coming — was otherwise only findable by running a
 * real build for twenty minutes, because there was no smaller thing to run.
 */

/**
 * How many turns one seat may spend on one note, against the content it is answering.
 *
 * Two, because past that the seat is not failing on something it can read — a note
 * writer that misread a gate rule fixes it first try, and one whose note is wrong
 * because the conversation never settled who uses the app will rewrite the same note
 * forever. The same split holds for a planner against the plan schema.
 *
 * It is a budget per READING of the note, not per note: `attemptsSpent` only counts
 * attempts recorded against the note as it now stands, so an answer that changes it
 * hands back a full budget and the loop tries again without anything having to notice.
 */
export const MAX_ATTEMPTS = 2

/**
 * The seats this loop spends attempts for, as they are written into a note's
 * `attempts:` line.
 *
 * They are values rather than a profile's own names because the ledger they are
 * recorded in belongs to this package: two profiles reading the same knowledge
 * directory have to agree on what `knowledge@abc123` means, or one of them hands the
 * other a budget it has already spent. A profile with seats of its own — a design
 * round, an agreement to settle — records those under names of its own choosing and
 * bounds them itself; nothing here reads them.
 */
export const SEATS = {
  /** Rewrites the note when a gate refuses it. */
  author: 'knowledge',
  /** Writes the plan the milestone is built from. */
  planner: 'architect',
  /** The person being asked, which is finite for the same reason as the others: a
   * question they did not answer is not improved by asking it again. */
  user: 'ask',
} as const

export type Seat = (typeof SEATS)[keyof typeof SEATS]

/**
 * The one thing to do next.
 *
 * A closed union rather than a set of booleans because the whole point is that exactly
 * one of these is true at a time. The shape it replaces — a flag per condition, each
 * armed by whoever noticed and read by whoever remembered to look — is what lets a run
 * rest with a milestone that can never be planned and nothing on screen saying so.
 */
export type ReconcileAction =
  | { kind: 'idle'; why: string }
  | { kind: 'repair-note'; note: MilestoneNote; reason: string }
  | { kind: 'write-plan'; note: MilestoneNote; reason: string }
  /**
   * Only a person can settle this, and every seat that could have resolved it has
   * spent its budget.
   *
   * `reason` is the machine wording and must not be repeated to anybody — the reader
   * has no idea what a milestone note is. `question` is the same refusal asked about
   * their app, which is what a harness renders.
   */
  | {
      kind: 'ask-user'
      note: MilestoneNote
      reason: string
      question: KnowledgeQuestion
    }
  | { kind: 'dispatch'; note: MilestoneNote }
  /**
   * A profile's gate is holding the milestone, and no seat this loop knows about can
   * clear it.
   *
   * The escape hatch is deliberate and narrow: the caller is handed the hold's name and
   * the notes it is about, and decides what that means. Modelling the profile's own
   * rounds here instead would put every profile's vocabulary in this union, and a hold
   * nothing in this package can act on is exactly the kind of state that used to become
   * a silent stall — so it is returned rather than swallowed as `idle`.
   */
  | { kind: 'hold'; hold: string; notes: KnowledgeNote[]; reason: string }

export interface ReconcileOptions {
  /** A profile's own dispatch gate — see {@link MilestoneGate}. */
  gate?: MilestoneGate
  /**
   * A profile's frontmatter keys, so a repair to one of them refunds the budget.
   *
   * Without this a note's fingerprint is taken over this package's scalars only, and a
   * seat that fixes a profile key — and nothing else — hands itself back no budget,
   * because as far as the ledger can see the note did not change.
   */
  profileScalars?: readonly string[]
}

/**
 * The `author` seat is counted across every body the note has had, the others only
 * against the body they are answering.
 *
 * The author is the seat whose own turn rewrites the note it is bounded by, so a
 * per-body budget is one it hands back to itself: a run answered two repairs by
 * rewriting the milestone's prose and leaving the missing `entities:` exactly as it
 * was, which reset the budget each time and never reached the user.
 */
const spent = (
  note: MilestoneNote,
  seat: Seat,
  profileScalars: readonly string[]
): boolean =>
  attemptsSpent(note, seat, {
    profileScalars,
    anyBody: seat === SEATS.author,
  }) >= MAX_ATTEMPTS

export async function nextAction(
  cwd: string,
  { gate, profileScalars = [] }: ReconcileOptions = {}
): Promise<ReconcileAction> {
  const isSpent = (note: MilestoneNote, seat: Seat) =>
    spent(note, seat, profileScalars)

  const milestones: MilestoneNote[] = await readMilestones(cwd, profileScalars)
  if (milestones.length === 0) {
    return {
      kind: 'idle',
      why: 'nothing is written down yet — whatever settles what to build owns this',
    }
  }

  // Order matters from here down. Earlier rows are conditions that make the later ones
  // meaningless: there is no point planning a second milestone while one is building,
  // and no point asking about a note whose profile gate has not been cleared.
  const building = milestones.find((note) => note.status === 'dispatched')
  if (building) return { kind: 'idle', why: `${building.path} is building` }

  const sketching = milestones.find((note) => note.status === 'designing')
  if (sketching) {
    return {
      kind: 'idle',
      why: `${sketching.path} is waiting on somebody to pick a look`,
    }
  }

  const ready: MilestoneReadiness = await readyMilestone(cwd, {
    gate,
    profileScalars,
    exhausted: (note) =>
      isSpent(note, SEATS.author) && isSpent(note, SEATS.user),
  })

  if (ready.ok) {
    const plan = readPlan(cwd, ready.milestone.path)
    if (plan.ok) return { kind: 'dispatch', note: ready.milestone }
    if (!isSpent(ready.milestone, SEATS.planner)) {
      return { kind: 'write-plan', note: ready.milestone, reason: plan.reason }
    }
    if (!isSpent(ready.milestone, SEATS.user)) {
      return {
        kind: 'ask-user',
        note: ready.milestone,
        reason: plan.reason,
        // A plan that could not be written is not a closed question: what is missing
        // is whatever the conversation never settled, and this package cannot know
        // what that is. Free text is the honest offer.
        question: askFreely(
          'What to build',
          `What should "${ready.milestone.title ?? ready.milestone.path}" actually do first?`
        ),
      }
    }
    return {
      kind: 'idle',
      why: `${ready.milestone.path} has no plan the planner could write and the user has been asked`,
    }
  }

  if (ready.awaitingNote) return { kind: 'idle', why: ready.reason }

  if (ready.awaiting) {
    return {
      kind: 'hold',
      hold: ready.awaiting.hold,
      notes: ready.awaiting.notes,
      reason: ready.reason,
    }
  }

  if (ready.repairable) {
    if (!isSpent(ready.repairable, SEATS.author)) {
      return {
        kind: 'repair-note',
        note: ready.repairable,
        reason: ready.reason,
      }
    }
    if (!isSpent(ready.repairable, SEATS.user)) {
      return {
        kind: 'ask-user',
        note: ready.repairable,
        reason: ready.reason,
        question:
          ready.question ??
          askFreely(
            'What to build',
            `What should "${ready.repairable.title ?? ready.repairable.path}" actually do?`
          ),
      }
    }
    return {
      kind: 'idle',
      why: `${ready.repairable.path} cannot be repaired and the user has been asked`,
    }
  }

  return { kind: 'idle', why: ready.reason }
}

export const KnowledgeReconcileInput = z.object({})

/**
 * The action, flattened to what survives a process boundary.
 *
 * Notes are paths rather than parsed notes on purpose: this is the shape a driver on
 * the other side of a command reads, and a driver that has the path can read the note
 * itself. In-process callers take {@link nextAction} and keep the notes.
 */
export const KnowledgeReconcileOutput = z.object({
  kind: z.enum([
    'idle',
    'repair-note',
    'write-plan',
    'ask-user',
    'dispatch',
    'hold',
  ]),
  /** Why this is the next thing to do, in one sentence somebody can act on. */
  reason: z.string(),
  /** The milestone note this action is about, when it is about one. */
  note: z.string().optional(),
  /** Which of a profile's holds this is, on `hold`. */
  hold: z.string().optional(),
  /** The notes a hold is about, on `hold`. */
  notes: z.array(z.string()).optional(),
  /** The refusal as a question for a person, on `ask-user`. */
  question: KnowledgeQuestionSchema.optional(),
})

export type KnowledgeReconcileResult = z.infer<typeof KnowledgeReconcileOutput>

export const runKnowledgeReconcile = async (
  root: string,
  _input: z.infer<typeof KnowledgeReconcileInput> = {},
  options: ReconcileOptions = {}
): Promise<KnowledgeReconcileResult> => {
  const action = await nextAction(root, options)
  switch (action.kind) {
    case 'idle':
      return { kind: 'idle', reason: action.why }
    case 'dispatch':
      return {
        kind: 'dispatch',
        reason: `${action.note.path} has a plan and is ready to build`,
        note: action.note.path,
      }
    case 'hold':
      return {
        kind: 'hold',
        reason: action.reason,
        hold: action.hold,
        notes: action.notes.map((note) => note.path),
      }
    case 'ask-user':
      return {
        kind: 'ask-user',
        reason: action.reason,
        note: action.note.path,
        question: action.question,
      }
    default:
      return {
        kind: action.kind,
        reason: action.reason,
        note: action.note.path,
      }
  }
}
