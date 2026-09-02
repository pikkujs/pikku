import { KNOWLEDGE_DIR, MILESTONE_TYPE, readKnowledgeNotes } from './notes.js'
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
 */
export const MILESTONE_SCALARS = ['surface', 'requires'] as const
export type MilestoneNote = ProfileNote<(typeof MILESTONE_SCALARS)[number]>

export const inMilestonesDir = (path: string): boolean =>
  path.startsWith(`${MILESTONES_DIR}/`)

const isSurface = (raw: string): raw is MilestoneSurface =>
  (MILESTONE_SURFACES as readonly string[]).includes(raw)

export function surfaceOf(note: MilestoneNote): MilestoneSurface {
  const raw = (note.surface ?? '').trim().toLowerCase()
  return isSurface(raw) ? raw : 'app'
}

export async function readMilestones(cwd: string): Promise<MilestoneNote[]> {
  return (await readKnowledgeNotes(cwd, MILESTONE_SCALARS)).filter(
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
