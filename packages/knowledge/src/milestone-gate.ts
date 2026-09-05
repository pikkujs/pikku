import {
  MILESTONES_DIR,
  MILESTONE_STATUSES,
  MILESTONE_SURFACES,
  entitiesOf,
  firstPersonStep,
  gherkinOf,
  personasIn,
  quotedIn,
  readMilestones,
  surfaceOf,
  toolsOf,
  type MilestoneNote,
} from './milestone.js'
import type { KnowledgeNote } from './notes.js'

/**
 * Is there a milestone ready to hand to a builder, and which one?
 *
 * This is the dispatch gate: the last read before something spends a build on a note,
 * and the only place that decides a note is buildable. It refuses with ONE sentence
 * somebody can act on, never a list — the audience is an agent mid-turn, and a refusal
 * it cannot act on in one step becomes a retry loop rather than a repair.
 *
 * Every check here is about the SHAPE of the note: what it must contain to be one
 * buildable piece rather than an intention. What a profile layers on top — an
 * agreement somebody has to give, a registry that has to resolve a name, a design
 * round — comes in through `gate`, because none of it is knowable from the note alone.
 */

/**
 * A refusal that belongs to somebody other than the note's author.
 *
 * The three refusal owners are the whole reason this is a union rather than a string:
 * `repairable` is handed back to whoever writes the notes, `awaitingNote` says nothing
 * is written down at all, and this one says the milestone is held on something no edit
 * to the note resolves. `hold` names which of the profile's holds it is, so the caller
 * can route it without this package learning what the hold means.
 */
export interface MilestoneHold {
  hold: string
  notes: KnowledgeNote[]
}

export type MilestoneReadiness =
  | {
      ok: true
      milestone: MilestoneNote
      gherkin: string
      personas: string[]
    }
  | {
      ok: false
      reason: string
      /**
       * The note this refusal is ABOUT, when rewriting that note would fix it — a
       * missing `entities:`, no gherkin, a first-person step, a scenario naming
       * nobody. Absent for the refusals no edit resolves: a milestone already
       * building, one waiting on a design pick, or no note written yet.
       *
       * It exists because one seat owns the note and nobody else may touch it, so a
       * refusal is only actionable if it can be handed back there. Without it the
       * only recovery is asking somebody a question and dispatching on the turn
       * after — which silently requires a conversation to still be going.
       */
      repairable?: MilestoneNote
      /**
       * Nothing is written down at all, so the refusal is not about any note.
       *
       * Set because a caller has to tell two states apart that read alike: a
       * milestone that failed a rule, and a conversation that has not settled one
       * yet. Only the second is worth waiting on rather than acting on.
       */
      awaitingNote?: true
      /** A profile's own hold — see {@link MilestoneHold}. */
      awaiting?: MilestoneHold
    }

export type MilestoneRefusal = Extract<MilestoneReadiness, { ok: false }>

/**
 * A profile's own gate, run on a note that has already passed every shape check here.
 *
 * Returns null when the profile is content. It runs LAST for the same reason the
 * screens check does in the profile that motivated this: a refusal from here typically
 * sends somebody back to a conversation rather than back to the note, and spending
 * that conversation on a note that is still malformed spends it on a milestone that
 * cannot be dispatched anyway.
 */
export type MilestoneGate = (
  cwd: string,
  note: MilestoneNote
) => Promise<MilestoneRefusal | null>

export interface ReadyMilestoneOptions {
  gate?: MilestoneGate
  /**
   * A profile's own frontmatter keys, so the notes handed to `gate` carry them.
   *
   * A gate that reads a key of its own gets an empty one otherwise, and refuses a note
   * that says everything it asked for.
   */
  profileScalars?: readonly string[]
  /**
   * Says a note's repair budget is gone, so the queue walks past it.
   *
   * Reading only the front of the queue means one note nobody can fix wedges every
   * milestone behind it: a first note written with no `entities:` that has spent both
   * its repairs and its question sits idle with a flawless second note queued behind
   * it that would have dispatched.
   */
  exhausted?: (note: MilestoneNote) => boolean
}

export async function readyMilestone(
  cwd: string,
  {
    gate,
    profileScalars = [],
    exhausted = () => false,
  }: ReadyMilestoneOptions = {}
): Promise<MilestoneReadiness> {
  const milestones: MilestoneNote[] = await readMilestones(cwd, profileScalars)

  // Checked BEFORE anything about the queue, because a milestone in flight is the true
  // reason for every refusal below it and the only one nobody can fix by editing.
  // Ordering it after the queue rules tells a seat that had correctly written the next
  // milestone to go delete a note, when the real answer is "the first one is building".
  const inFlight = milestones.filter((note) => note.status === 'dispatched')
  if (inFlight.length > 0) {
    return {
      ok: false,
      reason: `Not dispatched: ${inFlight.map((n) => n.path).join(', ')} is already building. Write the next milestone note whenever the next piece settles, and dispatch it once this one lands — this note only records that it was dispatched, never how the build is doing.`,
    }
  }

  // A status nothing recognises makes the note INVISIBLE: it is in no bucket, so the
  // caller is told "nothing is written down yet" over a note that says everything, and
  // the loop idles with a full knowledge base. Surfaced as repairable, because the fix
  // is one line and belongs to whoever wrote it.
  const unreadable = milestones.find(
    (note) => !MILESTONE_STATUSES.includes(note.status as never)
  )
  if (unreadable) {
    return {
      ok: false,
      reason: `Not dispatched: ${unreadable.path} has \`status: ${unreadable.status}\`, which is not a status. It is one of ${MILESTONE_STATUSES.join(', ')}, on its own line. Rewrite that line and leave the rest of the note alone.`,
      repairable: unreadable,
    }
  }

  // Path order IS build order — notes are `NN-name.md`, numbered as each piece settles
  // — so several `proposed` notes are a QUEUE and this takes the front of it. Refusing
  // the second one forbids writing ahead, which means a build finishing has nothing to
  // pick up and the next milestone is only written once somebody notices.
  const proposed = milestones
    .filter((note) => note.status === 'proposed')
    .sort((a, b) => a.path.localeCompare(b.path))

  if (proposed.length === 0) {
    // A milestone waiting on a look is the commonest reason there is nothing to
    // dispatch, and it is NOT the same problem as a missing note: the note is written,
    // and saying "write one" sends the caller to duplicate the note it already has.
    const designing = milestones.filter((note) => note.status === 'designing')
    if (designing.length > 0) {
      return {
        ok: false,
        reason: `Not dispatched: ${designing.map((n) => n.path).join(', ')} is \`status: designing\` — somebody is being shown looks for it and has not picked one. When they pick, record the choice on that note and move it to \`status: proposed\`. If they have said to build it as it stands, move it to \`proposed\` as it is.`,
      }
    }
    return {
      ok: false,
      awaitingNote: true,
      reason: `Not dispatched: nothing is written down yet. A milestone is filed to ${MILESTONES_DIR}/ before it can be built, so there is nothing here to hand a builder. Settle one piece of what is being built and file it as a note.`,
    }
  }

  let firstRefusal: MilestoneRefusal | null = null
  for (const note of proposed) {
    const readiness = await noteReadiness(cwd, note, gate)
    if (readiness.ok) return readiness
    firstRefusal ??= readiness
    if (!readiness.repairable || !exhausted(readiness.repairable))
      return readiness
  }
  return firstRefusal!
}

async function noteReadiness(
  cwd: string,
  milestone: MilestoneNote,
  gate: MilestoneGate | undefined
): Promise<MilestoneReadiness> {
  if (entitiesOf(milestone).length === 0) {
    return {
      ok: false,
      reason: `Not dispatched: ${milestone.path} has no \`entities:\` — name the thing this milestone is about, so it is one buildable piece rather than an intention.`,
      repairable: milestone,
    }
  }

  const gherkin = gherkinOf(milestone)
  if (!gherkin) {
    return {
      ok: false,
      reason: `Not dispatched: ${milestone.path} has no \`\`\`gherkin block. The scenario is what a builder turns into a real test — without it there is nothing that says the milestone is done.`,
      repairable: milestone,
    }
  }

  // Catching this at dispatch is the cheap moment: once a builder has turned the step
  // into a scenario, the missing actor shows up as a test that cannot run.
  const firstPerson = firstPersonStep(gherkin)
  if (firstPerson) {
    return {
      ok: false,
      reason: `Not dispatched: this step in ${milestone.path} is written in the first person — \`${firstPerson}\`. Write it about the persona — \`Given 'owner' has no entry for today\`, not \`Given I have no entry\` — because the scenario runs AS someone.`,
      repairable: milestone,
    }
  }

  // The gherkin IS where the people are named, and it is named BEFORE any of them is
  // declared in code: a builder writes `definePersonas` from these names, so checking
  // against declared personas here would refuse every first milestone — the one this
  // gate most needs to let through.
  //
  // ONE person is enough, and this must never ask for a second. A single persona still
  // proves a database, sign-in, an owned row and a query scoped to its owner, and
  // owner-A-cannot-see-owner-B is a sharper test of the shape than a role invented to
  // satisfy a counter. Asked for a second kind of person in order to dispatch at all, a
  // planner will invent one — and then design them a surface nobody asked for.
  const named = personasIn(gherkin)
  if (named.length === 0) {
    return {
      ok: false,
      reason: `Not dispatched: the scenario in ${milestone.path} names nobody. Quote the person in each step — \`Given 'owner' …\` — so the scenario knows who it runs as.`,
      repairable: milestone,
    }
  }

  // Every quoted token must DRIVE a step somewhere, not merely be mentioned in one. A
  // person acts, so they appear in subject position, while a single-quoted domain value
  // (`saved as 'today'`) and a second actor introduced mid-sentence never do. Refusing
  // both is what makes quoting mean something.
  const passive = quotedIn(gherkin).filter((name) => !named.includes(name))
  if (passive.length > 0) {
    return {
      ok: false,
      reason: `Not dispatched: the scenario in ${milestone.path} quotes ${passive.map((n) => `'${n}'`).join(', ')} without ever letting them act. A single quote means a person, so either give ${passive[0] ? `'${passive[0]}'` : 'them'} a step of their own — \`When '${passive[0]}' …\` — or drop the quotes if it was never a person (a domain value goes bare, or in double quotes).`,
      repairable: milestone,
    }
  }

  const surface = (milestone.surface ?? '').trim().toLowerCase()
  if (
    milestone.surface !== undefined &&
    !(MILESTONE_SURFACES as readonly string[]).includes(surface)
  ) {
    return {
      ok: false,
      reason: `Not dispatched: ${milestone.path} has \`surface: ${milestone.surface}\`, which is not one of ${MILESTONE_SURFACES.join(', ')}. Use the one this milestone reaches its person through, or drop the line — absent means \`app\`.`,
      repairable: milestone,
    }
  }

  if (surfaceOf(milestone) === 'agent' && toolsOf(milestone).length === 0) {
    return {
      ok: false,
      reason: `Not dispatched: ${milestone.path} is \`surface: agent\` and names no \`tools:\`. An agent is a model holding your app's own functions and deciding when to use them; given none, it ships a chat box that answers questions about the app confidently and cannot do one thing in it. List the functions it may call on a \`tools:\` line — \`tools: bookAppointment, listOpenSlots, cancelBooking\`. A tool that sends, charges, deletes or posts is built behind an approval, so name those too rather than avoiding them.`,
      repairable: milestone,
    }
  }

  const held = await gate?.(cwd, milestone)
  if (held) return held

  return { ok: true, milestone, gherkin, personas: named }
}
