import { setNoteScalars } from './ledger.js'
import {
  KNOWLEDGE_DIR,
  MILESTONE_TYPE,
  listOf,
  readKnowledgeNotes,
} from './notes.js'
import type { KnowledgeNote, ProfileNote } from './notes.js'

export const MILESTONES_DIR = `${KNOWLEDGE_DIR}/milestones`

/**
 * What a milestone is judged as. Holding every milestone to `screens:` refused one for
 * lacking a page it was never going to have — a CLI does not get a route, and an MCP
 * tool is used by a machine. What the surface changes is WHICH proof a first pass owes,
 * never whether it owes one.
 */
export const MILESTONE_SURFACES = [
  'app',
  'cli',
  'mcp',
  'agent',
  'backend',
] as const
export type MilestoneSurface = (typeof MILESTONE_SURFACES)[number]

/**
 * The frontmatter keys a milestone carries on top of the base profile.
 *
 * `surface:` is what the milestone reaches its person THROUGH, and it lives on the note
 * rather than in the plan: a milestone that is a CLI is a fact about the milestone, not
 * about the document written from it. `requires:` is what it cannot be built without.
 * `tools:` is the functions a `surface: agent` milestone lets its model call, which is
 * the one surface whose capability is not implied by anything else on the note.
 */
export const MILESTONE_SCALARS = ['surface', 'requires', 'tools'] as const
export type MilestoneNote = ProfileNote<(typeof MILESTONE_SCALARS)[number]>

export const inMilestonesDir = (path: string): boolean =>
  path.startsWith(`${MILESTONES_DIR}/`)

export const withoutMilestonesDir = (path: string): string =>
  path.replace(`${MILESTONES_DIR}/`, '')

/**
 * `designing` sits before `proposed`: the milestone is written down but is NOT to
 * be built yet, because whoever is being shown its looks has not picked one. Only
 * `proposed` is dispatchable, so the two cannot be one status without a milestone
 * being built out from under the person still choosing how it should look.
 */
export const MILESTONE_STATUSES = [
  'designing',
  'proposed',
  'dispatched',
  'built',
] as const

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

const isSurface = (raw: string): raw is MilestoneSurface =>
  (MILESTONE_SURFACES as readonly string[]).includes(raw)

export function surfaceOf(note: MilestoneNote): MilestoneSurface {
  const raw = (note.surface ?? '').trim().toLowerCase()
  return isSurface(raw) ? raw : 'app'
}

/**
 * Every milestone note, index and log excluded.
 *
 * @param extraScalars a profile's own frontmatter keys, read alongside this one's. A
 * profile that gates on a key of its own — or whose repair budget must notice that key
 * changing — has to be handed the note WITH it: read without, the key is absent from
 * the parsed note, so a gate reads it as empty and a fingerprint taken over it cannot
 * tell that it moved.
 */
export async function readMilestones<Key extends string = never>(
  cwd: string,
  extraScalars: readonly Key[] = []
): Promise<ProfileNote<(typeof MILESTONE_SCALARS)[number] | Key>[]> {
  return (
    await readKnowledgeNotes<(typeof MILESTONE_SCALARS)[number] | Key>(cwd, [
      ...MILESTONE_SCALARS,
      ...extraScalars,
    ])
  ).filter(
    (note) =>
      inMilestonesDir(note.path) &&
      !note.reserved &&
      note.type === MILESTONE_TYPE
  )
}

/** The ```gherkin block in a milestone note's body, or null if it has none. */
export function gherkinOf(note: KnowledgeNote): string | null {
  const fenced = /```gherkin\r?\n([\s\S]*?)```/i.exec(note.body)
  return fenced ? fenced[1]!.trim() || null : null
}

/**
 * Every persona a Gherkin body names in SUBJECT position — `Given 'owner' has …`
 * → `owner`. This is what answers "who does this scenario run as".
 *
 * Single quotes mean a persona; double quotes are the product's own words and are
 * never read as a person. Treating both alike made a checklist item called "Took my
 * meds" a gate failure — one quote style has to stay free for domain values.
 */
export function personasIn(gherkin: string): string[] {
  const names = new Set<string>()
  for (const [, , name] of gherkin.matchAll(
    /^\s*(given|when|then|and|but)\s+'([A-Za-z][A-Za-z0-9]*)'/gim
  )) {
    names.add(name!)
  }
  return [...names]
}

/** The entities a milestone's `entities:` names. */
export const entitiesOf = (note: KnowledgeNote): string[] =>
  listOf(note.entities)

/**
 * The functions a `surface: agent` milestone lets its model call.
 *
 * An agent milestone is a model holding the app's own functions and deciding when to
 * use them. Given none it ships a chat box that answers questions about the app
 * confidently and cannot do one thing in it — and no dependency gate catches that,
 * because a milestone that declared nothing has nothing unmet.
 */
export const toolsOf = (note: MilestoneNote): string[] =>
  listOf(note.tools?.replace(/[[\]]/g, ''))

/**
 * The `addon:<name>` tokens on a milestone's `requires:` line, in declaration order.
 *
 * A `requires:` token names ONE published addon, never a category or a kind of
 * service, and whether a given name resolves is not knowable here — the registry
 * behind it belongs to whoever is driving the build. This is the parse; the
 * resolution is a profile gate's.
 */
export const addonsOf = (note: MilestoneNote): string[] =>
  listOf(note.requires)
    .map((token) => token.split(':').map((part) => part.trim()))
    .filter(([kind, name]) => kind === 'addon' && !!name)
    .map(([, name]) => name!)

const PERSONA_QUOTE = /'([A-Za-z][A-Za-z0-9]*)'/g

/**
 * Every single-quoted name a Gherkin body mentions in a step, in ANY position —
 * not just the subject.
 *
 * Only looking at the subject position missed a real planner output — `Given
 * 'member' has borrowed a drill and 'member2' has borrowed a hammer` — where the
 * undeclared second actor was mid-sentence, and the milestone dispatched with a
 * scenario naming somebody who can never be resolved to an actor.
 *
 * Double quotes are deliberately NOT collected: they are the product's own words.
 * A persona written in double quotes is not silently let through either —
 * `personasIn` will not see it, so the scenario names nobody and is refused.
 */
export function quotedIn(gherkin: string): string[] {
  const names = new Set<string>()
  for (const line of gherkin.split('\n')) {
    if (!/^\s*(given|when|then|and|but)\b/i.test(line)) continue
    for (const [, name] of line.matchAll(PERSONA_QUOTE)) {
      names.add(name!)
    }
  }
  return [...names]
}

// A step written as the user rather than about them. Catching this at dispatch is
// the cheap moment: once it has been turned into a scenario, the missing actor
// shows up as a test that cannot run.
const FIRST_PERSON =
  /^\s*(given|when|then|and|but)\b[^\n]*\b(i|my|me|we|our)\b/i

/**
 * The first step written in the first person, or null.
 *
 * Double-quoted spans are blanked before the test, because a `"…"` is a DOMAIN
 * VALUE rather than scenario voice — a checklist item is genuinely called "Took my
 * meds". Testing the raw line flagged that step as first-person, and since the
 * refusal did not say which line tripped it, a real run went looking, guessed wrong
 * twice, and finally renamed the product's own content to get past the gate. A lint
 * rule must never edit the product. (Single quotes still mean a persona, so they
 * are left alone for `quotedIn`.)
 *
 * Returns the step so the refusal can quote it: "somewhere in this block" is not
 * something an agent can act on in one step.
 */
export function firstPersonStep(gherkin: string): string | null {
  for (const line of gherkin.split('\n')) {
    if (FIRST_PERSON.test(line.replace(/"[^"]*"/g, '""'))) return line.trim()
  }
  return null
}

/**
 * Move a milestone note to the next state, in place, and stamp WHEN.
 *
 * Rewrites only the `status:` line and the `statusAt:` beside it, so nothing an
 * author wrote is touched. A milestone that stayed `proposed` after being dispatched
 * would be dispatched again on the next call, which is how one milestone gets built
 * twice.
 *
 * The stamp is what makes "how long has this been building?" answerable. The obvious
 * alternative — the note's mtime — is not the transition time at all: the note is
 * edited after dispatch for all sorts of reasons, and every edit would push the
 * apparent dispatch time forward, so a build stuck for an hour would keep looking
 * like it had just started.
 */
export function setMilestoneStatus(
  cwd: string,
  notePath: string,
  status: MilestoneStatus
): void {
  setNoteScalars(
    cwd,
    notePath,
    { status, statusAt: new Date().toISOString() },
    ['status']
  )
}

const normalise = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * The unbuilt milestone a free-text nomination names, or null when it names none.
 *
 * A seat that runs out of written-down milestones can nominate a sub-feature — or
 * anything at all — and an unchecked loop will build it and call it the next
 * milestone. Matching against the notes is what keeps the count and what is on
 * screen describing the same thing.
 */
export async function nominatedMilestone(
  cwd: string,
  nomination: string
): Promise<MilestoneNote | null> {
  const wanted = normalise(nomination)
  if (!wanted) return null
  const unbuilt = (await readMilestones(cwd)).filter(
    (note) => note.status !== 'built'
  )
  return (
    unbuilt.find((note) => {
      const title = normalise(note.title ?? '')
      const slug = normalise(
        withoutMilestonesDir(note.path).replace(/^\d+[-_]?/, '')
      )
      return (
        (title &&
          (title === wanted ||
            title.includes(wanted) ||
            wanted.includes(title))) ||
        (slug &&
          (slug === wanted || slug.includes(wanted) || wanted.includes(slug)))
      )
    }) ?? null
  )
}

/** The one milestone currently `dispatched`, or null when there is not exactly one. */
export async function dispatchedMilestone(
  cwd: string
): Promise<MilestoneNote | null> {
  try {
    const dispatched = (await readMilestones(cwd)).filter(
      (note) => note.status === 'dispatched'
    )
    return dispatched.length === 1 ? dispatched[0]! : null
  } catch (err) {
    console.warn(
      `[milestone] could not read the dispatched milestone: ${String(err)}`
    )
    return null
  }
}

/**
 * Mark the dispatched milestone built, so the queue hands out the next one.
 *
 * Refuses when there is not exactly one: marking the wrong note built loses a
 * milestone silently, whereas leaving them alone hands the same one out again —
 * visible, and recoverable.
 */
export async function markDispatchedMilestoneBuilt(
  cwd: string
): Promise<MilestoneNote | null> {
  try {
    const dispatched = (await readMilestones(cwd)).filter(
      (note) => note.status === 'dispatched'
    )
    if (dispatched.length !== 1) {
      console.warn(
        `[milestone] a build finished with ${dispatched.length} dispatched milestone(s) — nothing marked built, so the queue will hand the same milestone out again`
      )
      return null
    }
    setMilestoneStatus(cwd, dispatched[0]!.path, 'built')
    return dispatched[0]!
  } catch (err) {
    console.warn(
      `[milestone] could not mark the dispatched milestone built: ${String(err)}`
    )
    return null
  }
}

/**
 * Hold every milestone's lifecycle across a turn that rewrites its note.
 *
 * A milestone note is frozen once its status leaves `proposed` — whatever is
 * building was dispatched against that exact body. Nothing otherwise enforces that
 * against a seat which re-files notes WHILE a build is running and writes whole
 * files: a run had a milestone dispatched at 10:21 and back to `proposed` with no
 * `statusAt` at 10:28, seven minutes into its own build. A reader then shows a
 * building milestone as next-up, and the gate hands the same milestone to a second
 * builder.
 *
 * A snapshot-and-restore rather than a write ban, because re-filing the BODY is
 * wanted — later answers genuinely belong in the note. Only the two scalars the
 * state machine owns are put back.
 */
export async function holdMilestoneLifecycle(
  cwd: string
): Promise<() => Promise<void>> {
  const held = new Map<string, { status: string; statusAt: string | null }>()
  try {
    for (const note of await readMilestones(cwd)) {
      if (!note.status || note.status === 'proposed') continue
      held.set(note.path, {
        status: note.status,
        statusAt: note.statusAt ?? null,
      })
    }
  } catch (err) {
    console.warn(`[milestone] could not snapshot the lifecycle: ${String(err)}`)
  }
  return async () => {
    if (held.size === 0) return
    try {
      for (const note of await readMilestones(cwd)) {
        const was = held.get(note.path)
        if (!was || note.status === was.status) continue
        console.warn(
          `[milestone] ${note.path} came back \`${note.status ?? 'none'}\` from a turn that rewrites notes — restoring \`${was.status}\``
        )
        setNoteScalars(cwd, note.path, {
          status: was.status,
          statusAt: was.statusAt,
        })
      }
    } catch (err) {
      console.warn(
        `[milestone] could not restore the lifecycle: ${String(err)}`
      )
    }
  }
}
