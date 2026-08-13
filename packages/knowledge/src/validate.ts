import { basename, posix } from 'node:path'
import { z } from 'zod'
import { checkKnowledgeResources } from './check-resources.js'
import { decisionFences } from './decision-fence.js'
import {
  KNOWLEDGE_DIR,
  type KnowledgeNote,
  isMilestone,
  readKnowledgeNotes,
  sectionOf,
  toPosix,
} from './notes.js'

/**
 * Declared, not inferred from the schema below.
 *
 * A finding crosses an RPC boundary as part of the `getKnowledge` payload, and a
 * `z.infer<>` is not a type a JSON-schema generator can walk: zod's inference
 * bottoms out in `this` types, so ts-json-schema-generator fails outright on it.
 * An interface generates. The `satisfies` is what keeps the two from drifting —
 * a field added to one and not the other is a compile error.
 */
export interface KnowledgeFinding {
  id: string
  severity: 'error' | 'warn' | 'info'
  message: string
  path: string
  fixHint: string
}

export const KnowledgeFindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  path: z.string(),
  fixHint: z.string(),
}) satisfies z.ZodType<KnowledgeFinding>

export const KnowledgeValidateInput = z.object({})

export const KnowledgeValidateOutput = z.object({
  ok: z.boolean(),
  notes: z.number(),
  findings: z.array(KnowledgeFindingSchema),
})

export type KnowledgeValidateResult = z.infer<typeof KnowledgeValidateOutput>

/**
 * The sections of the app-project profile. Each answers one question about the
 * app, which is what keeps a note findable without an index of indexes.
 */
export const KNOWLEDGE_SECTIONS: Record<string, string> = {
  milestones:
    'one buildable piece of the app, with the scenario that proves it',
  entities: 'a thing the app is about, in the language users use for it',
  decisions: 'a rule that was chosen, and what it rules out',
  'decisions/design': 'a rule about how the app looks and behaves',
  'decisions/internals': 'a rule about how it works under the hood, and why',
  'decisions/security': 'a rule about who may do what',
  questions: 'something asked and not yet answered',
  wishlist: 'something wanted that nobody has asked to be built',
}

/**
 * Directories that describe something pikku already knows, so a note here is
 * always a copy that will drift. The value is where the truth actually lives.
 */
const FORBIDDEN_SECTIONS: Record<string, string> = {
  personas: "`definePersonas()` in the project's own code",
  scenarios: 'the gherkin block inside the milestone the scenario belongs to',
  permissions: 'a decision note under decisions/security/',
  schemas: '`pikku meta` — the generated schema is the schema',
  tables: '`pikku meta` — the generated db schema is the schema',
  routes: '`pikku meta` — the generated http meta is the routes',
}

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

/** Max entities per milestone: more than three and it is not one buildable piece. */
const MAX_MILESTONE_ENTITIES = 3

/**
 * The directory milestones live in, and the one they used to live in. A bundle
 * written before the rename holds `knowledge/slices/`; those notes are still
 * milestones, so the section keeps its description and its place in the reading
 * order instead of sorting to the end as a section nothing declares.
 */
export const MILESTONE_SECTION = 'milestones'
const LEGACY_SECTIONS: Record<string, string> = { slices: MILESTONE_SECTION }

export const canonicalSection = (section: string): string => {
  const parts = section.split(posix.sep)
  const top = parts[0]
  if (!top || !LEGACY_SECTIONS[top]) return section
  return [LEGACY_SECTIONS[top], ...parts.slice(1)].join(posix.sep)
}

const isGherkinFirstPerson = (body: string): boolean =>
  /^\s*(given|when|then|and|but)\s+(i|we|my|our)\b/im.test(body)

const hasGherkinBlock = (body: string): boolean => /```gherkin/i.test(body)

/**
 * @param alreadyRead the notes to validate, for a caller that has just read them
 * itself. Passing them keeps the verdict and whatever the caller built from those
 * same notes describing one revision of the files: a knowledge base is edited by
 * hand and by agents while a console is open, so two reads a moment apart can
 * straddle a save and report findings against a note nobody is being shown.
 */
export const runKnowledgeValidate = async (
  root: string,
  outDir: string,
  alreadyRead?: KnowledgeNote[]
): Promise<KnowledgeValidateResult> => {
  const notes = alreadyRead ?? (await readKnowledgeNotes(root))
  const findings: KnowledgeFinding[] = []
  const add = (
    severity: KnowledgeFinding['severity'],
    id: string,
    message: string,
    path: string,
    fixHint: string
  ): void => {
    findings.push({ id, severity, message, path, fixHint })
  }

  if (notes.length === 0) {
    add(
      'info',
      'knowledge-empty',
      'No knowledge notes — nothing about this app is written down where an agent will find it',
      KNOWLEDGE_DIR,
      `Start with ${KNOWLEDGE_DIR}/index.md, then add a note the turn you learn something pikku cannot tell you`
    )
    return { ok: true, notes: 0, findings }
  }

  const paths = new Set(notes.map((note) => toPosix(note.path)))
  const has = (rel: string): boolean => paths.has(`${KNOWLEDGE_DIR}/${rel}`)

  if (!has('index.md')) {
    add(
      'error',
      'knowledge-no-index',
      'knowledge/index.md is missing — a reader has no entry point and no map of the sections',
      `${KNOWLEDGE_DIR}/index.md`,
      'Write knowledge/index.md listing each section and the one question it answers'
    )
  }

  const sections = new Set<string>()
  for (const note of notes) {
    const section = sectionOf(note.path)
    if (!section) continue
    // Every level counts, not just the one the note sits in: a `decisions/` that
    // holds nothing but `decisions/security/` is still a directory a reader will
    // open, and it needs to say what belongs in it.
    const parts = section.split(posix.sep)
    for (let depth = 1; depth <= parts.length; depth++) {
      sections.add(parts.slice(0, depth).join(posix.sep))
    }
  }

  // A forbidden directory is one thing to delete however deep it goes, so it is
  // reported against its top level only — `personas/` and `personas/admin/` are
  // the same finding, and emitting it per sub-section would put the same id in
  // the list twice with nothing to distinguish the copies.
  const reportedForbidden = new Set<string>()

  for (const section of [...sections].sort()) {
    if (!has(`${section}/index.md`)) {
      add(
        'warn',
        `knowledge-section-no-index-${section.replace(/\//g, '-')}`,
        `${KNOWLEDGE_DIR}/${section}/ has no index.md, so nothing says what belongs in it`,
        `${KNOWLEDGE_DIR}/${section}/index.md`,
        `Add ${section}/index.md the same turn you create the section — one line on what it holds${
          KNOWLEDGE_SECTIONS[canonicalSection(section)]
            ? `: ${KNOWLEDGE_SECTIONS[canonicalSection(section)]}`
            : ''
        }`
      )
    }
    const top = section.split(posix.sep)[0]!
    const forbidden = FORBIDDEN_SECTIONS[top]
    if (forbidden && !reportedForbidden.has(top)) {
      reportedForbidden.add(top)
      add(
        'error',
        `knowledge-forbidden-section-${top}`,
        `${KNOWLEDGE_DIR}/${top}/ duplicates something the project already declares, so it will drift`,
        `${KNOWLEDGE_DIR}/${top}`,
        `Delete it — that belongs in ${forbidden}`
      )
    }
  }

  for (const note of notes) {
    const section = sectionOf(note.path)

    if (!note.type) {
      add(
        'error',
        `knowledge-no-type-${note.path}`,
        `${note.path} has no \`type\` — it is the one field OKF requires, and every reader groups on it`,
        note.path,
        'Add frontmatter with a `type` (milestone, entity, decision, note, overview)'
      )
    }

    // A note at the root of knowledge/ that is not index.md or log.md: a flat
    // product.md / glossary.md is not a knowledge base — it is one long document
    // that nothing can link into and no gate can read.
    if (!section && !note.reserved) {
      add(
        'warn',
        `knowledge-flat-note-${basename(note.path)}`,
        `${note.path} sits at the root of knowledge/, so it is a document rather than a note in a graph`,
        note.path,
        `Move it into the section that answers its question (${Object.keys(
          KNOWLEDGE_SECTIONS
        )
          .filter((s) => !s.includes('/'))
          .join(', ')}), splitting it if it covers several`
      )
    }

    // Every note, not only `type: decision`: a milestone states a decision about as
    // often, and a fence that does not parse renders as a code block wherever it
    // sits. Nothing here requires a fence — a decision argued in prose is a
    // decision, and demanding one per note would be a finding against every
    // note already written.
    // The ordinal, because a note may hold more than one fence and every other
    // id here is one-per-note. Two of these sharing an id is a finding a caller
    // cannot tell apart — `findings.find(byId)` returns the first and the second
    // fence goes unreported.
    for (const [index, fence] of decisionFences(note.body).entries()) {
      const nth = `${note.path}-${index + 1}`
      if (!fence.decision) {
        add(
          'warn',
          `knowledge-decision-fence-unparsed-${nth}`,
          `${note.path} has a \`\`\`decision fence with no \`chosen:\`, so it renders as a code block rather than the decision it states`,
          note.path,
          'Give the fence a `chosen:` line — with `rules-out:` and `because:` under it'
        )
        continue
      }
      if (fence.decision.rulesOut.length === 0) {
        add(
          'warn',
          `knowledge-decision-nothing-ruled-out-${nth}`,
          `${note.path} says what was chosen but not what that rules out, which is the half that stops it being reopened`,
          note.path,
          'Add `rules-out:` naming the alternative that was considered and rejected'
        )
      }
    }

    if (!isMilestone(note)) continue

    if (!note.status) {
      add(
        'error',
        `knowledge-milestone-no-status-${note.path}`,
        `${note.path} is a milestone with no \`status\`, so nothing can tell whether it is built`,
        note.path,
        `Add \`status:\` — one of ${MILESTONE_STATUSES.join(', ')}`
      )
    } else if (
      !(MILESTONE_STATUSES as readonly string[]).includes(note.status)
    ) {
      add(
        'error',
        `knowledge-milestone-bad-status-${note.path}`,
        `${note.path} has status "${note.status}", which no gate recognises`,
        note.path,
        `Use one of ${MILESTONE_STATUSES.join(', ')}`
      )
    }

    const entities = (note.entities ?? '')
      .split(',')
      .map((entity) => entity.trim())
      .filter(Boolean)
    if (entities.length === 0) {
      add(
        'warn',
        `knowledge-milestone-no-entities-${note.path}`,
        `${note.path} is a milestone that names no entities, so its size cannot be judged`,
        note.path,
        'Add `entities:` listing the entities it touches, comma-separated'
      )
    } else if (entities.length > MAX_MILESTONE_ENTITIES) {
      add(
        'error',
        `knowledge-milestone-too-big-${note.path}`,
        `${note.path} touches ${entities.length} entities — past ${MAX_MILESTONE_ENTITIES} it is not one buildable piece`,
        note.path,
        `Split it into milestones of at most ${MAX_MILESTONE_ENTITIES} entities each`
      )
    }

    if (!hasGherkinBlock(note.body)) {
      add(
        'error',
        `knowledge-milestone-no-scenario-${note.path}`,
        `${note.path} is a milestone with no \`\`\`gherkin scenario, so there is nothing to build against or verify`,
        note.path,
        'Add a fenced ```gherkin block with the Given/When/Then that proves the milestone'
      )
    } else if (isGherkinFirstPerson(note.body)) {
      add(
        'error',
        `knowledge-milestone-first-person-${note.path}`,
        `${note.path} writes its scenario in the first person, which hides who is acting`,
        note.path,
        `Write it in the third person, naming the persona in quotes: Given 'owner' has an entry for today`
      )
    }
  }

  const resources = await checkKnowledgeResources(root, outDir, { notes })
  for (const problem of resources.problems) {
    add(
      'error',
      // The note path is part of the id here for the same reason it is in every
      // other finding: two notes naming one deleted function are two things to
      // fix, and an id that named only the uri would collapse them into one.
      `knowledge-resource-${problem.reason}-${problem.path}-${problem.uri}`,
      `${problem.path}: ${problem.detail}`,
      problem.path,
      problem.reason === 'unknown-prefix'
        ? 'Use a resource kind the project can resolve, or drop the field'
        : 'Update the note to the new name, or delete it if the thing is gone'
    )
  }

  return {
    ok: !findings.some((finding) => finding.severity === 'error'),
    notes: notes.length,
    findings,
  }
}
