import { basename, posix } from 'node:path'
import { z } from 'zod'
import { checkKnowledgeResources } from './check-resources.js'
import {
  KNOWLEDGE_DIR,
  type KnowledgeNote,
  readKnowledgeNotes,
  sectionOf,
  toPosix,
} from './notes.js'

export const KnowledgeFindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  path: z.string(),
  fixHint: z.string(),
})

export type KnowledgeFinding = z.infer<typeof KnowledgeFindingSchema>

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
  slices: 'one buildable piece of the app, with the scenario that proves it',
  entities: 'a thing the app is about, in the language users use for it',
  decisions: 'a rule that was chosen, and what it rules out',
  'decisions/design': 'a rule about how the app looks and behaves',
  'decisions/security': 'a rule about who may do what',
  questions: 'something asked and not yet answered',
  wishlist: 'something wanted that nobody has asked to be built',
}

/**
 * Directories that describe something pikku already knows, so a note here is
 * always a copy that will drift. The value is where the truth actually lives.
 */
const FORBIDDEN_SECTIONS: Record<string, string> = {
  personas: '`scenarios.personas` in pikku.config.json',
  scenarios: 'the gherkin block inside the slice the scenario belongs to',
  permissions: 'a decision note under decisions/security/',
  schemas: '`pikku meta` — the generated schema is the schema',
  tables: '`pikku meta` — the generated db schema is the schema',
  routes: '`pikku meta` — the generated http meta is the routes',
}

const SLICE_STATUSES = ['proposed', 'dispatched', 'built'] as const

/** Max entities per slice: more than three and it is not one buildable piece. */
const MAX_SLICE_ENTITIES = 3

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
          KNOWLEDGE_SECTIONS[section] ? `: ${KNOWLEDGE_SECTIONS[section]}` : ''
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
        'Add frontmatter with a `type` (slice, entity, decision, note, overview)'
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

    if (note.type !== 'slice') continue

    if (!note.status) {
      add(
        'error',
        `knowledge-slice-no-status-${note.path}`,
        `${note.path} is a slice with no \`status\`, so nothing can tell whether it is built`,
        note.path,
        `Add \`status:\` — one of ${SLICE_STATUSES.join(', ')}`
      )
    } else if (!(SLICE_STATUSES as readonly string[]).includes(note.status)) {
      add(
        'error',
        `knowledge-slice-bad-status-${note.path}`,
        `${note.path} has status "${note.status}", which no gate recognises`,
        note.path,
        `Use one of ${SLICE_STATUSES.join(', ')}`
      )
    }

    const entities = (note.entities ?? '')
      .split(',')
      .map((entity) => entity.trim())
      .filter(Boolean)
    if (entities.length === 0) {
      add(
        'warn',
        `knowledge-slice-no-entities-${note.path}`,
        `${note.path} is a slice that names no entities, so its size cannot be judged`,
        note.path,
        'Add `entities:` listing the entities it touches, comma-separated'
      )
    } else if (entities.length > MAX_SLICE_ENTITIES) {
      add(
        'error',
        `knowledge-slice-too-big-${note.path}`,
        `${note.path} touches ${entities.length} entities — past ${MAX_SLICE_ENTITIES} it is not one buildable piece`,
        note.path,
        `Split it into slices of at most ${MAX_SLICE_ENTITIES} entities each`
      )
    }

    if (!hasGherkinBlock(note.body)) {
      add(
        'error',
        `knowledge-slice-no-scenario-${note.path}`,
        `${note.path} is a slice with no \`\`\`gherkin scenario, so there is nothing to build against or verify`,
        note.path,
        'Add a fenced ```gherkin block with the Given/When/Then that proves the slice'
      )
    } else if (isGherkinFirstPerson(note.body)) {
      add(
        'error',
        `knowledge-slice-first-person-${note.path}`,
        `${note.path} writes its scenario in the first person, which hides who is acting`,
        note.path,
        `Write it in the third person, naming the persona in quotes: Given 'owner' has an entry for today`
      )
    }
  }

  const resources = await checkKnowledgeResources(root, outDir, notes)
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
