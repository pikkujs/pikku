import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { z } from 'zod'

export const KNOWLEDGE_DIR = 'knowledge'

/**
 * A note in an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
 * bundle: a markdown file whose **path is its identity**, carrying YAML
 * frontmatter plus a body. Only `type` is required.
 *
 * `status`, `entities` and `statusAt` apply to `type: slice`, which is a piece of
 * work rather than a fact — so unlike every other note it has a state, a size,
 * and a time its state last changed.
 */
export const KnowledgeNoteSchema = z.object({
  path: z.string(),
  type: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  resource: z.string().optional(),
  tags: z.array(z.string()).optional(),
  timestamp: z.string().optional(),
  status: z.string().optional(),
  entities: z.string().optional(),
  statusAt: z.string().optional(),
  reserved: z.enum(['index', 'log']).optional(),
  body: z.string(),
})

export type KnowledgeNote = z.infer<typeof KnowledgeNoteSchema>

/**
 * The scalars this profile reads. Anything else in the frontmatter is left
 * alone: OKF permits extra fields, and a profile built on top of this one adds
 * its own — Fabric's `design:` is read by Fabric, not here.
 */
const SCALARS = [
  'type',
  'title',
  'description',
  'resource',
  'timestamp',
  'status',
  'entities',
  'statusAt',
] as const

/** `type` and `status` are closed vocabularies compared literally by every gate. */
const LOWERCASED = new Set<string>(['type', 'status'])

const unquote = (value: string): string =>
  value.trim().replace(/^["']|["']$/g, '')

/**
 * One frontmatter value that may be a list, in any of the three shapes an LLM
 * actually writes: flow (`[a, b]`), a block of `- item` lines, or a bare scalar.
 * Returns the index of the last line consumed so the caller's loop skips a
 * block's items instead of re-reading them as keys.
 */
const readList = (
  lines: string[],
  index: number,
  rawValue: string
): { items: string[]; consumed: number } => {
  if (/^\[.*\]$/.test(rawValue)) {
    return {
      items: rawValue.slice(1, -1).split(',').map(unquote).filter(Boolean),
      consumed: index,
    }
  }
  if (rawValue === '') {
    const items: string[] = []
    let next = index
    while (next + 1 < lines.length && /^\s*-\s+/.test(lines[next + 1]!)) {
      items.push(unquote(lines[++next]!.replace(/^\s*-\s+/, '')))
    }
    return { items: items.filter(Boolean), consumed: next }
  }
  return { items: [unquote(rawValue)].filter(Boolean), consumed: index }
}

/**
 * Parse one note. The frontmatter is flat scalars plus list-valued `tags` and
 * `entities`, so a line parser covers it without a YAML dependency.
 */
export const parseNote = (path: string, raw: string): KnowledgeNote => {
  const note: KnowledgeNote = { path, body: raw }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (frontmatter) {
    note.body = frontmatter[2]!.replace(/^\s+/, '')
    const lines = frontmatter[1]!.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]!)
      if (!pair) continue
      const key = pair[1]!
      const rawValue = pair[2]!.trim()
      if (key === 'tags') {
        const { items, consumed } = readList(lines, i, rawValue)
        note.tags = items
        i = consumed
      } else if (key === 'entities') {
        // Declared comma-separated, but a YAML block list is the more natural way
        // to write a sequence and gets written about as often. Joining back to the
        // comma form keeps every reader a plain split.
        const { items, consumed } = readList(lines, i, rawValue)
        note.entities = items.join(', ')
        i = consumed
      } else if (
        (SCALARS as readonly string[]).includes(key) &&
        rawValue !== ''
      ) {
        const value = unquote(rawValue)
        ;(note as Record<string, unknown>)[key] = LOWERCASED.has(key)
          ? value.toLowerCase()
          : value
      }
    }
  }
  const base = basename(path).toLowerCase()
  if (base === 'index.md') note.reserved = 'index'
  else if (base === 'log.md') note.reserved = 'log'
  return note
}

const collectMarkdown = async (
  dir: string,
  root: string,
  out: KnowledgeNote[]
): Promise<void> => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectMarkdown(full, root, out)
      continue
    }
    if (!entry.isFile()) continue
    if (!/\.(md|markdown|txt)$/i.test(entry.name)) continue
    out.push(parseNote(relative(root, full), await readFile(full, 'utf8')))
  }
}

/** Every note under `<root>/knowledge/`, path-sorted. Empty when there is none. */
export const readKnowledgeNotes = async (
  root: string
): Promise<KnowledgeNote[]> => {
  const dir = join(root, KNOWLEDGE_DIR)
  if (!existsSync(dir) || !(await stat(dir)).isDirectory()) return []
  const notes: KnowledgeNote[] = []
  await collectMarkdown(dir, root, notes)
  return notes.sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * The ids a note's `resource:` claims. OKF leaves the field free-form; this
 * profile puts one or more `<kind>:<id>` URIs there, comma-separated — so this
 * is a split, not a parse. Case-sensitive: pikku ids are camelCase and
 * `createEntry` is not `createentry`.
 */
export const resourceIds = (note: KnowledgeNote): string[] =>
  note.resource
    ? note.resource
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : []
