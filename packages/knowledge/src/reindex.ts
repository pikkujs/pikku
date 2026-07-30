import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, posix, sep } from 'node:path'
import { z } from 'zod'
import {
  KNOWLEDGE_DIR,
  type KnowledgeNote,
  readKnowledgeNotes,
} from './notes.js'
import { KNOWLEDGE_SECTIONS } from './validate.js'

/**
 * The listing in an `index.md` is generated; the prose around it is not.
 *
 * Rewriting the whole file would delete the one thing an index is for — the
 * sentence a human wrote about why the section exists — so only the fenced block
 * is ever replaced, and a file without the fence keeps everything it had.
 */
const OPEN = '<!-- pikku:knowledge-index -->'
const CLOSE = '<!-- /pikku:knowledge-index -->'

export const ReindexedFileSchema = z.object({
  path: z.string(),
  action: z.enum(['created', 'updated', 'unchanged']),
})

export type ReindexedFile = z.infer<typeof ReindexedFileSchema>

export const KnowledgeIndexInput = z.object({
  check: z
    .boolean()
    .optional()
    .describe('Report stale indexes without writing, for use as a CI gate'),
})

export const KnowledgeIndexOutput = z.object({
  /** False only in check mode, when something on disk is stale. */
  ok: z.boolean(),
  check: z.boolean(),
  files: z.array(ReindexedFileSchema),
})

export type KnowledgeIndexResult = z.infer<typeof KnowledgeIndexOutput>

const toPosix = (path: string): string => path.split(sep).join(posix.sep)

/** `knowledge/decisions/design/a.md` → `decisions/design`; a root note → `''`. */
const sectionOf = (path: string): string => {
  const parts = toPosix(path).split(posix.sep)
  return parts.slice(parts.indexOf(KNOWLEDGE_DIR) + 1, -1).join(posix.sep)
}

/**
 * What to call a note in a listing. The frontmatter `title` wins; otherwise the
 * first heading in the body, then the filename — a listing of slugs is still more
 * useful than a listing of nothing.
 */
const labelOf = (note: KnowledgeNote): string => {
  if (note.title) return note.title
  const heading = /^#{1,6}\s+(.+)$/m.exec(note.body)
  if (heading) return heading[1]!.trim()
  return basename(note.path).replace(/\.(md|markdown|txt)$/i, '')
}

const line = (label: string, href: string, description?: string): string =>
  description
    ? `- [${label}](${href}) — ${description}`
    : `- [${label}](${href})`

/** Splice the generated listing into a file's text, leaving its prose alone. */
const spliceListing = (existing: string | null, listing: string): string => {
  const block = `${OPEN}\n${listing}\n${CLOSE}`
  if (existing === null) return `${block}\n`
  const open = existing.indexOf(OPEN)
  const close = existing.indexOf(CLOSE)
  if (open !== -1 && close > open) {
    return (
      existing.slice(0, open) + block + existing.slice(close + CLOSE.length)
    )
  }
  return `${existing.replace(/\s*$/, '')}\n\n${block}\n`
}

const sentenceCase = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1)

/**
 * A section index nobody has written yet. It carries the section's one-line
 * purpose so the file is worth having from the moment it appears — an index whose
 * only content is a generated list teaches a reader nothing.
 */
const scaffold = (title: string, description: string): string => {
  const heading = sentenceCase(title)
  return [
    '---',
    'type: overview',
    `title: ${heading}`,
    '---',
    '',
    `# ${heading}`,
    '',
    `${sentenceCase(description)}.`,
    '',
  ].join('\n')
}

/**
 * Refresh every `index.md` in the bundle so each section lists what is actually
 * in it, and the root lists the sections.
 *
 * In check mode nothing is written and `ok` reports whether the listings on disk
 * already match — that is the form a CI gate wants, because a stale index is the
 * failure that makes a reader trust a section that no longer holds what it claims.
 */
export const runKnowledgeIndex = async (
  root: string,
  check = false
): Promise<KnowledgeIndexResult> => {
  const notes = await readKnowledgeNotes(root)
  if (notes.length === 0) return { ok: true, check, files: [] }

  const bySection = new Map<string, KnowledgeNote[]>()
  for (const note of notes) {
    const section = sectionOf(note.path)
    if (note.reserved) {
      // An index lists notes, never itself or the log.
      if (!bySection.has(section)) bySection.set(section, [])
      continue
    }
    const list = bySection.get(section)
    if (list) list.push(note)
    else bySection.set(section, [note])
  }

  // A section that holds nothing but sub-sections still needs an index:
  // `decisions/` containing only `decisions/security/` is still where a reader
  // looks to find out where decisions live, and without this it would be the one
  // directory in the bundle with nothing pointing into it.
  //
  // Snapshotted, because the loop adds to the very map it is walking.
  const sectionsWithNotes = [...bySection.keys()]
  for (const section of sectionsWithNotes) {
    const parts = section.split(posix.sep)
    for (let depth = 1; depth < parts.length; depth++) {
      const ancestor = parts.slice(0, depth).join(posix.sep)
      if (!bySection.has(ancestor)) bySection.set(ancestor, [])
    }
  }

  /**
   * The sections one level below `parent` — an index maps its own children and
   * stops there. Listing grandchildren would turn every index into a copy of the
   * whole bundle, which is the thing an index is meant to save a reader from.
   */
  const childSections = (parent: string): string[] =>
    [...bySection.keys()]
      .filter((name) => {
        if (!name) return false
        if (!parent) return !name.includes(posix.sep)
        return (
          name.startsWith(`${parent}${posix.sep}`) &&
          !name.slice(parent.length + 1).includes(posix.sep)
        )
      })
      .sort()

  const existing = new Map(notes.map((note) => [toPosix(note.path), note]))
  const files: ReindexedFile[] = []

  for (const [section, sectionNotes] of [...bySection].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const indexRel = section
      ? `${KNOWLEDGE_DIR}/${section}/index.md`
      : `${KNOWLEDGE_DIR}/index.md`

    // Sub-sections first, then the notes sitting directly in this one — a reader
    // looking for "where do decisions live" should not have to read past a note
    // to find out.
    const entries = [
      ...childSections(section).map((name) => {
        const leaf = name.split(posix.sep).at(-1)!
        return line(leaf, `${leaf}/index.md`, KNOWLEDGE_SECTIONS[name])
      }),
      ...sectionNotes.map((note) =>
        line(labelOf(note), basename(note.path), note.description)
      ),
    ]

    const listing =
      entries.length > 0 ? entries.join('\n') : '_Nothing here yet._'

    const current = existing.get(indexRel)
    const before = current
      ? await readFile(join(root, ...indexRel.split(posix.sep)), 'utf8')
      : scaffold(
          section ? section.split(posix.sep).at(-1)! : 'Knowledge',
          section
            ? (KNOWLEDGE_SECTIONS[section] ?? `Notes in ${section}`)
            : 'What this app is, in the language its users use'
        )
    const after = spliceListing(before, listing)

    if (current && before === after) {
      files.push({ path: indexRel, action: 'unchanged' })
      continue
    }
    files.push({ path: indexRel, action: current ? 'updated' : 'created' })
    if (check) continue
    const absolute = join(root, ...indexRel.split(posix.sep))
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, after, 'utf8')
  }

  const stale = files.some((file) => file.action !== 'unchanged')
  return { ok: check ? !stale : true, check, files }
}
