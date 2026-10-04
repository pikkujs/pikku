import { z } from 'zod'
import { noteHash, readKnowledgeNotes, sectionOf } from './notes.js'
import { knowledgeCoverage, readPlans } from './plan.js'
import { functionsDirFor, planShortfall, readPikkuMeta } from './plan-meta.js'

/**
 * The knowledge the code does not do yet, as work to file.
 *
 * A note becomes a change when nobody has planned it, when it was edited after the
 * changeset that built it, or when that changeset deferred part of it. Each gap is
 * filed as a change carrying a `Knowledge: <note>@<hash>` line, which is what stops
 * the same reading of a note being filed twice; an edit gives it a new hash, and it
 * comes back.
 *
 * It runs the other way too. Code a merged changeset built that the meta no longer has
 * is `removed`, and a note a merged changeset built that is no longer on disk is
 * `deleted`: either the knowledge is stale or the code is, and which one is a decision
 * for whoever reads the gap, not for this function. Their hash is their own, so the
 * change that first built the note does not read as having filed them.
 */
export const KNOWLEDGE_LINE = /^Knowledge: (\S+)@([0-9a-f]{6,})\s*$/gm

/** Sections that record something other than work: open questions and wishes. */
const NOT_WORK = new Set(['questions', 'wishlist'])

export const KnowledgeGapSchema = z.object({
  note: z.string(),
  hash: z.string(),
  state: z.enum(['uncovered', 'changed', 'partial', 'removed', 'deleted']),
  leftBehind: z.array(
    z.object({ item: z.string(), why: z.string(), at: z.string() })
  ),
  missing: z
    .array(z.string())
    .default([])
    .describe('What a merged changeset built for this note that is gone now.'),
  by: z.array(z.string()).default([]),
})

export type KnowledgeGap = z.output<typeof KnowledgeGapSchema>

/** The `note@hash` readings already filed, read off change bodies. */
export const filedKnowledge = (bodies: Array<string | null>): Set<string> =>
  new Set(
    bodies.flatMap((body) =>
      [...(body ?? '').matchAll(KNOWLEDGE_LINE)].map(
        ([, note, hash]) => `${note}@${hash}`
      )
    )
  )

export const knowledgeLine = (gap: Pick<KnowledgeGap, 'note' | 'hash'>) =>
  `Knowledge: ${gap.note}@${gap.hash}`

export interface KnowledgeGapOptions {
  /** Change bodies, so a gap already filed is not filed again. */
  filed?: Array<string | null>
  /** Whether a changeset has merged; a plan on disk is merged unless told otherwise. */
  merged?: (changeset: string) => boolean
}

export const KnowledgeGapsInput = z.object({})

export const KnowledgeGapsOutput = z.object({
  gaps: z.array(KnowledgeGapSchema),
})

export type KnowledgeGapsResult = z.infer<typeof KnowledgeGapsOutput>

export const runKnowledgeGaps = async (
  root: string,
  { filed = [], merged = () => true }: KnowledgeGapOptions = {}
): Promise<KnowledgeGapsResult> => {
  const notes = (await readKnowledgeNotes(root)).filter(
    (note) => !NOT_WORK.has(sectionOf(note.path).split('/')[0]!)
  )
  const plans = readPlans(root).flatMap((read) =>
    read.ok ? [{ plan: read.plan, merged: merged(read.plan.changeset) }] : []
  )
  const bodies = new Map(notes.map((note) => [note.path, note.body]))
  const already = filedKnowledge(filed)
  const gaps: KnowledgeGap[] = []
  const add = (gap: KnowledgeGap) => {
    if (!already.has(`${gap.note}@${gap.hash}`)) gaps.push(gap)
  }
  const strip = (path: string) => path.replace(/^knowledge\//, '')
  const onDisk = new Set(notes.map((note) => strip(note.path)))
  const meta = readPikkuMeta(functionsDirFor(root))
  const generated = Object.keys(meta.functions).length > 0
  for (const { plan, merged: isMerged } of plans) {
    if (!isMerged) continue
    const missing = generated ? planShortfall(plan, meta).missing : []
    for (const entry of plan.covers) {
      const note = `knowledge/${strip(entry.note)}`
      const base = { leftBehind: [], by: [plan.changeset] }
      if (!onDisk.has(strip(entry.note)))
        add({
          ...base,
          note,
          hash: noteHash(`deleted\0${entry.hash}`),
          state: 'deleted',
          missing: [],
        })
      else if (missing.length)
        add({
          ...base,
          note,
          hash: noteHash(
            `removed\0${bodies.get(note) ?? ''}\0${missing.join('\0')}`
          ),
          state: 'removed',
          missing,
        })
    }
  }
  const flagged = new Set(gaps.map((gap) => gap.note))
  for (const coverage of knowledgeCoverage(notes, plans)) {
    if (coverage.state === 'covered' || coverage.state === 'claimed') continue
    if (flagged.has(coverage.note)) continue
    add({
      note: coverage.note,
      hash: noteHash(bodies.get(coverage.note)!),
      state: coverage.state,
      leftBehind: coverage.leftBehind,
      missing: [],
      by: coverage.by,
    })
  }
  return { gaps }
}
