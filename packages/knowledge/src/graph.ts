import { posix } from 'node:path'
import { z } from 'zod'
import { type KnowledgeNote, resourceIds, sectionOf, toPosix } from './notes.js'
import { KNOWLEDGE_SECTIONS } from './validate.js'

/**
 * Declared rather than inferred, for the reason given on `KnowledgeFinding`:
 * this shape is the body of the `getKnowledge` RPC's output, and a `z.infer<>`
 * is not something a JSON-schema generator can walk.
 *
 * Note this is necessary but not sufficient for that RPC to ship an output
 * schema — `KnowledgeBundle` reaches this type across a package boundary, and
 * the inspector registers no type whose base is declared in another package.
 */
export interface KnowledgeGraphNote {
  path: string
  /** `''` for a note at the root of knowledge/. */
  section: string
  type?: string
  title: string
  description?: string
  tags: string[]
  /** The `<kind>:<id>` URIs from `resource:`, already split. */
  resource: string[]
  status?: string
  /** When `status` last changed, for a reader asking how long it has been there. */
  statusAt?: string
  entities: string[]
  reserved?: 'index' | 'log'
  body: string
  /** Notes this one links to, as bundle-relative paths. */
  outbound: string[]
  /** Notes that link to this one. */
  inbound: string[]
  /** Link targets that resolve to no note. Legal in OKF — a note not written yet. */
  dangling: string[]
}

export interface KnowledgeSection {
  name: string
  description?: string
  count: number
}

export interface KnowledgeGraph {
  notes: KnowledgeGraphNote[]
  sections: KnowledgeSection[]
  /** Tag → how many notes carry it, for a browsable facet. */
  tagCounts: Record<string, number>
  stats: {
    notes: number
    sections: number
    links: number
    dangling: number
  }
}

export const KnowledgeGraphNoteSchema = z.object({
  path: z.string(),
  /** `''` for a note at the root of knowledge/. */
  section: z.string(),
  type: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()),
  /** The `<kind>:<id>` URIs from `resource:`, already split. */
  resource: z.array(z.string()),
  status: z.string().optional(),
  /** When `status` last changed, for a reader asking how long it has been there. */
  statusAt: z.string().optional(),
  entities: z.array(z.string()),
  reserved: z.enum(['index', 'log']).optional(),
  body: z.string(),
  /** Notes this one links to, as bundle-relative paths. */
  outbound: z.array(z.string()),
  /** Notes that link to this one. */
  inbound: z.array(z.string()),
  /** Link targets that resolve to no note. Legal in OKF — a note not written yet. */
  dangling: z.array(z.string()),
}) satisfies z.ZodType<KnowledgeGraphNote>

export const KnowledgeSectionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  count: z.number(),
}) satisfies z.ZodType<KnowledgeSection>

export const KnowledgeGraphSchema = z.object({
  notes: z.array(KnowledgeGraphNoteSchema),
  sections: z.array(KnowledgeSectionSchema),
  /** Tag → how many notes carry it, for a browsable facet. */
  tagCounts: z.record(z.string(), z.number()),
  stats: z.object({
    notes: z.number(),
    sections: z.number(),
    links: z.number(),
    dangling: z.number(),
  }),
}) satisfies z.ZodType<KnowledgeGraph>

/**
 * Fenced and inline code, removed before links are read.
 *
 * A milestone body is mostly a gherkin block and decisions quote paths; both contain
 * bracket-and-paren text that reads as a markdown link. Counting those would put
 * edges in the graph that no reader can click.
 */
const withoutCode = (body: string): string =>
  body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')

/**
 * The note paths a body links to, resolved against the linking note's directory.
 *
 * Only markdown links to a note are edges. An http(s) link, an anchor and a link
 * to a source file are all left out — the graph is of notes, and a link to
 * something else is prose that happens to be clickable.
 */
export const outboundLinks = (note: KnowledgeNote): string[] => {
  const from = toPosix(note.path).split(posix.sep).slice(0, -1)
  const found = new Set<string>()
  for (const [, target] of withoutCode(note.body).matchAll(
    /\[[^\]]*\]\(([^)\s]+)\)/g
  )) {
    const href = target!.split('#')[0]!
    if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue
    if (!/\.(md|markdown|txt)$/i.test(href)) continue
    const resolved = posix.normalize(
      href.startsWith('/') ? href.slice(1) : [...from, href].join(posix.sep)
    )
    found.add(resolved)
  }
  return [...found]
}

/**
 * Where a section sorts: the order the profile declares them in, which is the
 * order they are read in — a milestone, the entities it is about, the decisions
 * that govern it, then what is still open. Alphabetical would lead with
 * `decisions` and bury `milestones` in the middle, and would separate `decisions`
 * from `decisions/security` by everything in between.
 *
 * A section the profile does not name sorts after all of them, alphabetically,
 * which puts a parent ahead of its own children for free.
 */
const SECTION_RANK = new Map(
  Object.keys(KNOWLEDGE_SECTIONS).map((name, index) => [name, index])
)

const sectionRank = (name: string): number =>
  SECTION_RANK.get(name) ?? SECTION_RANK.size

/**
 * The notes, the links between them, and the counts a browser needs — derived in
 * one pass so a reader can be shown what points AT a note, which is the half of
 * the graph a markdown file cannot express on its own.
 */
export const buildKnowledgeGraph = (notes: KnowledgeNote[]): KnowledgeGraph => {
  const paths = new Set(notes.map((note) => toPosix(note.path)))
  const inbound = new Map<string, Set<string>>()
  const outbound = new Map<string, string[]>()
  const dangling = new Map<string, string[]>()

  for (const note of notes) {
    const self = toPosix(note.path)
    const links = outboundLinks(note)
    outbound.set(
      self,
      links.filter((link) => paths.has(link))
    )
    dangling.set(
      self,
      links.filter((link) => !paths.has(link))
    )
    for (const link of links) {
      if (!paths.has(link)) continue
      const into = inbound.get(link)
      if (into) into.add(self)
      else inbound.set(link, new Set([self]))
    }
  }

  const tagCounts: Record<string, number> = {}
  const sectionCounts = new Map<string, number>()

  const graphNotes = notes.map((note): KnowledgeGraphNote => {
    const self = toPosix(note.path)
    const section = sectionOf(note.path)
    // Registered whatever is in it, counted only for notes a reader would list.
    // A section holding nothing but its own index.md still exists, and leaving it
    // out drops it from the navigator while its notes are shown regardless.
    sectionCounts.set(
      section,
      (sectionCounts.get(section) ?? 0) + (note.reserved ? 0 : 1)
    )
    for (const tag of note.tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
    }
    return {
      path: self,
      section,
      type: note.type,
      title: note.title ?? titleOf(note),
      description: note.description,
      tags: note.tags ?? [],
      resource: resourceIds(note),
      status: note.status,
      statusAt: note.statusAt,
      entities: (note.entities ?? '')
        .split(',')
        .map((entity) => entity.trim())
        .filter(Boolean),
      reserved: note.reserved,
      body: note.body,
      outbound: outbound.get(self) ?? [],
      inbound: [...(inbound.get(self) ?? [])].sort(),
      dangling: dangling.get(self) ?? [],
    }
  })

  // A section that holds nothing but sub-sections is still a section: with only
  // `decisions/security/` written, `decisions` has no notes of its own and would
  // otherwise be missing from the list its own child appears in.
  //
  // Snapshotted, because the loop adds to the map it is walking.
  const sectionsWithNotes = [...sectionCounts.keys()]
  for (const section of sectionsWithNotes) {
    const parts = section.split(posix.sep)
    for (let depth = 1; depth < parts.length; depth++) {
      const ancestor = parts.slice(0, depth).join(posix.sep)
      if (!sectionCounts.has(ancestor)) sectionCounts.set(ancestor, 0)
    }
  }

  const sections = [...sectionCounts]
    .filter(([name]) => name)
    .sort(([a], [b]) => sectionRank(a) - sectionRank(b) || a.localeCompare(b))
    .map(([name, count]) => ({
      name,
      description: KNOWLEDGE_SECTIONS[name],
      count,
    }))

  return {
    notes: graphNotes,
    sections,
    tagCounts,
    stats: {
      notes: graphNotes.length,
      sections: sections.length,
      links: graphNotes.reduce(
        (total, note) => total + note.outbound.length,
        0
      ),
      dangling: graphNotes.reduce(
        (total, note) => total + note.dangling.length,
        0
      ),
    },
  }
}

/** The frontmatter title, else the first heading, else the filename. */
const titleOf = (note: KnowledgeNote): string => {
  const heading = /^#{1,6}\s+(.+)$/m.exec(note.body)
  if (heading) return heading[1]!.trim()
  return toPosix(note.path)
    .split(posix.sep)
    .at(-1)!
    .replace(/\.(md|markdown|txt)$/i, '')
}
