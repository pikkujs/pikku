/**
 * Mirrors the bundle `console:getKnowledge` returns (`KnowledgeBundle` in
 * @pikku/addon-console's knowledge.service, itself the graph from
 * @pikku/knowledge). The console has no type-level import of the addon, so the
 * two move together by hand — same arrangement as the db schema types.
 */

export interface KnowledgeNote {
  path: string
  /** `''` for a note at the root of knowledge/. */
  section: string
  type?: string
  title: string
  description?: string
  tags: string[]
  /** `<kind>:<id>` URIs, already split. */
  resource: string[]
  status?: string
  entities: string[]
  reserved?: 'index' | 'log'
  body: string
  outbound: string[]
  inbound: string[]
  /** Link targets that resolve to no note — legal, and worth showing. */
  dangling: string[]
}

export interface KnowledgeSection {
  name: string
  description?: string
  count: number
}

export interface KnowledgeFinding {
  id: string
  severity: 'error' | 'warn' | 'info'
  message: string
  path: string
  fixHint: string
}

export interface KnowledgeBundle {
  notes: KnowledgeNote[]
  sections: KnowledgeSection[]
  tagCounts: Record<string, number>
  stats: { notes: number; sections: number; links: number; dangling: number }
  findings: KnowledgeFinding[]
  ok: boolean
}

/**
 * What the reader is looking at. Findings are a selection of their own rather
 * than a banner on the document: several of them (a missing `knowledge/index.md`,
 * a forbidden section) point at a path that is not a note, so a per-note
 * presentation would hide exactly the problems nobody has written a note for.
 */
export type KnowledgeSelection =
  | { kind: 'findings' }
  | { kind: 'note'; path: string }

/** `knowledge/decisions/why.md` → `why.md`, which is what a listing wants. */
export const noteFileName = (path: string): string =>
  path.split('/').pop() ?? path

/**
 * Whether a note matches a free-text query. Deliberately includes the body: a
 * reader searching a knowledge base is usually looking for a phrase they
 * remember, not a title they can recall exactly.
 */
export const noteMatches = (note: KnowledgeNote, query: string): boolean => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [
    note.title,
    note.path,
    note.description ?? '',
    note.type ?? '',
    note.body,
    ...note.tags,
    ...note.resource,
  ].some((field) => field.toLowerCase().includes(q))
}

/** Most severe first — the order findings are read in, and ranked by. */
export const SEVERITY_ORDER: KnowledgeFinding['severity'][] = [
  'error',
  'warn',
  'info',
]

/**
 * The worst severity present, so one icon can stand for a whole list. `info` for
 * an empty list: the only thing a base with no findings has to say is that it has
 * nothing to say.
 */
export const maxSeverity = (
  findings: KnowledgeFinding[]
): KnowledgeFinding['severity'] =>
  SEVERITY_ORDER.find((severity) =>
    findings.some((finding) => finding.severity === severity)
  ) ?? 'info'

/** The findings that point at one note. */
export const findingsForNote = (
  findings: KnowledgeFinding[],
  path: string
): KnowledgeFinding[] => findings.filter((finding) => finding.path === path)

/**
 * The note path a markdown link in `fromPath`'s body points at, or `null` when the
 * link is not to a note (an http(s) link, a bare anchor, a source file).
 *
 * Mirrors the resolution `buildKnowledgeGraph` does in @pikku/knowledge, so a link
 * the reader can click is exactly a link the graph counted as an edge.
 */
export const resolveNoteLink = (
  fromPath: string,
  href: string
): string | null => {
  const target = href.split('#')[0] ?? ''
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return null
  if (!/\.(md|markdown|txt)$/i.test(target)) return null

  const parts = (
    target.startsWith('/')
      ? target.slice(1)
      : [...fromPath.split('/').slice(0, -1), target].join('/')
  ).split('/')

  const resolved: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return resolved.join('/')
}

export interface KnowledgeGroup {
  /** `''` for the notes at the root of knowledge/. */
  section: string
  /** The one question the section answers, when the profile names one. */
  description?: string
  notes: KnowledgeNote[]
}

/**
 * Notes grouped for the navigator: the root first — `knowledge/index.md` is the
 * entry point and reads as one — then each section in the order the bundle
 * reports, which is alphabetical.
 *
 * A section carrying only an `index.md` is still shown. It has no notes to list,
 * but it tells the reader the section exists and what belongs in it, which is the
 * whole point of having written it.
 */
export const groupNotesBySection = (
  bundle: Pick<KnowledgeBundle, 'notes' | 'sections'>
): KnowledgeGroup[] => {
  const order = ['', ...bundle.sections.map((section) => section.name)]
  const described = new Map(
    bundle.sections.map((section) => [section.name, section.description])
  )
  const bySection = new Map<string, KnowledgeNote[]>(
    order.map((section) => [section, []])
  )

  for (const note of bundle.notes) {
    const existing = bySection.get(note.section)
    if (existing) existing.push(note)
    else bySection.set(note.section, [note])
  }

  return [...bySection]
    .filter(([, notes]) => notes.length > 0)
    .map(([section, notes]) => ({
      section,
      description: described.get(section),
      notes,
    }))
}
