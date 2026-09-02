/**
 * Mirrors the bundle `console:getKnowledge` returns (`KnowledgeBundle` in
 * @pikku/addon-console's knowledge.service, itself the graph from
 * @pikku/knowledge). The console has no type-level import of the addon, so the
 * two move together by hand — same arrangement as the db schema types.
 */
import type { MilestonePlan } from './plan'

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
  /** Keyed by the milestone note's path, so a note document can find its own plan. */
  plans: Record<string, MilestonePlan>
}

/**
 * What the reader is looking at. Findings are a selection of their own rather
 * than a banner on the document: several of them (a missing `knowledge/index.md`,
 * a forbidden section) point at a path that is not a note, so a per-note
 * presentation would hide exactly the problems nobody has written a note for.
 */
export type KnowledgeSelection =
  { kind: 'findings' } | { kind: 'note'; path: string }

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

/**
 * The body as a reader should see it, with HTML comments removed.
 *
 * `pikku knowledge index` wraps the listing it generates in
 * `<!-- pikku:knowledge-index -->` markers so it can rewrite that block without
 * touching the prose around it. Markdown is rendered without raw-HTML support —
 * deliberately, since a note is untrusted text — so a comment arrives as a text
 * node and is drawn on the page, which is the one place those markers are
 * meant never to appear.
 *
 * Fenced code is left alone: a note about HTML that quotes a comment is showing
 * it on purpose.
 */
export const readableBody = (body: string): string =>
  body
    .split(/(```[\s\S]*?```)/g)
    .map((part, index) =>
      // Odd indices are the captured fences.
      index % 2 === 1 ? part : part.replace(/<!--[\s\S]*?-->/g, '')
    )
    .join('')
    // A comment on its own line leaves the blank lines that surrounded it, which
    // markdown renders as a gap where the marker used to be.
    .replace(/\n{3,}/g, '\n\n')

/**
 * The body without the heading that repeats the note's own title.
 *
 * A note is written to be read as a file, so it opens with `# Its Title` — right
 * in the repo, and duplicated here, where the title is already the heading of the
 * page. Only the opening heading is considered, and only when it says the same
 * thing as the title: a note whose first heading is a real section keeps it.
 */
export const bodyWithoutTitle = (body: string, title: string): string => {
  const heading = /^\s*#{1,6}[ \t]+(.+?)[ \t]*(?:\n|$)/.exec(body)
  if (
    !heading ||
    heading[1]!.trim().toLowerCase() !== title.trim().toLowerCase()
  )
    return body
  return body.slice(heading[0].length).replace(/^\s+/, '')
}

/**
 * The note a reader should land on: the bundle's entry point, which is the
 * `index.md` at the root of `knowledge/`. Falling back to the first note in path
 * order opens whichever section happens to sort first — `decisions/` — rather
 * than the one note written to be read first.
 */
export const entryPointNote = (
  notes: KnowledgeNote[]
): KnowledgeNote | undefined =>
  notes.find((note) => note.section === '' && note.reserved === 'index') ??
  notes[0]

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
    if (part === '..') {
      // A link that climbs past the repo root is not a link to a note. Popping an
      // empty stack instead would clamp it back inside — `../../elsewhere.md`
      // from a root note would resolve to `elsewhere.md`, which is a different
      // file, and possibly one that exists.
      if (resolved.length === 0) return null
      resolved.pop()
    } else resolved.push(part)
  }
  return resolved.join('/')
}

/**
 * The `<kind>:<id>` scheme a note's `resource:` uses to point at the thing in the
 * code it is about. Mirrors `RESOURCE_PREFIXES` in @pikku/knowledge, which is a
 * node module the console cannot import — the same hand-kept arrangement as the
 * bundle types above.
 */
export const RESOURCE_PREFIXES = [
  'func',
  'workflow',
  'schema',
  'http',
  'queue',
  'cron',
  'channel',
  'table',
  'addon',
  'scope',
  'persona',
] as const

export type ResourcePrefix = (typeof RESOURCE_PREFIXES)[number]

export interface ResourceUri {
  prefix: ResourcePrefix
  id: string
}

/** `func:createEntry` → `{ prefix: 'func', id: 'createEntry' }`; null if it isn't one. */
export const parseResourceUri = (uri: string): ResourceUri | null => {
  const at = uri.indexOf(':')
  if (at <= 0) return null
  const prefix = uri.slice(0, at)
  const id = uri.slice(at + 1).trim()
  if (!id) return null
  if (!(RESOURCE_PREFIXES as readonly string[]).includes(prefix)) return null
  return { prefix: prefix as ResourcePrefix, id }
}

/**
 * Where in the console a resource URI leads, or null when nothing here shows
 * that kind of thing.
 *
 * Null rather than a page that ignores the id: a `resource:` is a claim about
 * one function, one table, one persona, and a link that lands on a list with the
 * subject nowhere on screen teaches the reader that these links do not work. A
 * `schema:` has no screen at all, so it stays plain text.
 *
 * The paths are the console's own routes. In an embedded console they are
 * rewritten by the host's `Link` — which is the reason this returns a path
 * rather than navigating itself.
 */
export const resourceHref = (uri: string): string | null => {
  const parsed = parseResourceUri(uri)
  if (!parsed) return null
  const { prefix, id } = parsed
  const search = encodeURIComponent(id)
  switch (prefix) {
    case 'func':
      return `/functions?search=${search}`
    case 'workflow':
      return `/workflow?search=${search}`
    case 'http':
      return `/apis?tab=http&search=${search}`
    case 'channel':
      return `/apis?tab=channels&search=${search}`
    case 'queue':
      return `/jobs?tab=queues&search=${search}`
    case 'cron':
      return `/jobs?tab=schedulers&search=${search}`
    case 'scope':
      return `/scopes?search=${search}`
    // Both screens select from their own tree rather than from a query, so the
    // link opens the screen and the reader picks up from there. Better than
    // nothing, and it stops being a half-link the moment either grows a `?search=`.
    case 'persona':
      return '/personas'
    case 'table':
      return '/database'
    case 'addon':
      return '/addons'
    // A generated JSON schema is not a screen in this console.
    case 'schema':
      return null
  }
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
 * reports, which is the order the profile declares them in.
 *
 * A section carrying only an `index.md` is still shown. It has no notes to list,
 * but it tells the reader the section exists and what belongs in it, which is the
 * whole point of having written it.
 */
export interface KnowledgeNavSection {
  /** `''` for the notes at the root of knowledge/. */
  section: string
  /** The last segment — `security`, not `decisions/security`, since the parent is directly above. */
  label: string
  /** How far to indent: `decisions/security` sits one level in from `decisions`. */
  depth: number
  description?: string
  /** The section's own index.md, which its header opens. */
  indexPath?: string
  /** Everything in the section except that index. */
  notes: KnowledgeNote[]
}

/**
 * The navigator's shape: a section's `index.md` becomes the section's own header
 * rather than a row beside the notes it indexes.
 *
 * A bundle is mostly indexes — five of this harness's thirteen notes — and listing
 * them as peers gives a reader four rows called `index.md` to tell apart, while
 * the heading that would have told them apart sits right above. The heading is
 * the index, so it opens it.
 */
export const toNavSections = (
  groups: KnowledgeGroup[]
): KnowledgeNavSection[] =>
  groups.map((group) => {
    const index = group.notes.find((note) => note.reserved === 'index')
    return {
      section: group.section,
      label: group.section.split('/').pop() ?? '',
      depth: group.section ? group.section.split('/').length - 1 : 0,
      description: group.description,
      indexPath: index?.path,
      notes: group.notes.filter((note) => note !== index),
    }
  })

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
