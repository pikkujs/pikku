import { z } from 'zod'
import { type KnowledgeNote, readKnowledgeNotes, resourceIds } from './notes.js'
import {
  RESOURCE_PREFIXES,
  collectKnownResources,
  parseResourceUri,
} from './resource-uri.js'

export const ResourceProblemSchema = z.object({
  path: z.string(),
  uri: z.string(),
  reason: z.enum(['unknown-prefix', 'dangling']),
  detail: z.string(),
})

export type ResourceProblem = z.infer<typeof ResourceProblemSchema>

export const ResourceCheckSchema = z.object({
  ok: z.boolean(),
  /** Notes carrying a `resource:` at all. */
  notes: z.number(),
  /** URIs whose prefix had meta behind it, so the id was actually verified. */
  checked: z.number(),
  /** URIs whose prefix had no meta in this project — unverifiable, not wrong. */
  skipped: z.number(),
  problems: z.array(ResourceProblemSchema),
})

export type ResourceCheck = z.infer<typeof ResourceCheckSchema>

/**
 * Schemes a markdown link may carry that are somebody else's to resolve. A
 * target starting with one of these is a link out of the project, not a mistyped
 * resource URI.
 */
const WEB_SCHEMES = new Set([
  'http',
  'https',
  'mailto',
  'tel',
  'ftp',
  'file',
  'data',
])

const MARKDOWN_LINK = /\]\(\s*([^)\s]+)/g

const CODE = /```[\s\S]*?```|`[^`\n]*`/g

/**
 * The resource URIs a note's PROSE points at — `[createEntry](func:createEntry)`
 * — which is how a note names a thing in the code mid-sentence instead of in a
 * field at the top.
 *
 * Held to the same standard as `resource:`, for the reason the scheme exists at
 * all: a reference nothing checks rots into fiction exactly where it looks most
 * authoritative, and an inline link is MORE authoritative to a reader than a
 * frontmatter field they may never expand.
 *
 * Code is skipped. A note explaining the scheme quotes `func:createEntry` inside
 * a fence on purpose, and that example must not have to name a function that
 * really exists.
 */
export const bodyResourceUris = (note: KnowledgeNote): string[] => {
  const prose = note.body.replace(CODE, '')
  const uris: string[] = []
  for (const match of prose.matchAll(MARKDOWN_LINK)) {
    const href = match[1]!.split(/[?#]/)[0]!
    const colon = href.indexOf(':')
    if (colon <= 0) continue
    const scheme = href.slice(0, colon).toLowerCase()
    // `//` after the scheme is a URL authority — a host, not a resource id.
    if (WEB_SCHEMES.has(scheme) || href.slice(colon + 1).startsWith('//')) {
      continue
    }
    uris.push(href)
  }
  return uris
}

/**
 * Verify every `resource:` in the bundle against what the code actually offers,
 * in the frontmatter field and in the prose alike.
 *
 * The two failure modes are deliberately different: an unrecognised prefix is the
 * note's fault (it invented a kind), while a recognised prefix with an id nobody
 * exports is drift (the code was renamed or deleted under the note).
 *
 * The check fails CLOSED on drift and OPEN on ignorance: an id missing from a
 * prefix that resolved is a problem, but a prefix with no meta at all is skipped.
 * A project without queues must not be told its queue references are broken.
 */
export const checkKnowledgeResources = async (
  root: string,
  outDir: string,
  notes?: KnowledgeNote[]
): Promise<ResourceCheck> => {
  const all = notes ?? (await readKnowledgeNotes(root))
  const known = await collectKnownResources(root, outDir)

  const problems: ResourceProblem[] = []
  let withResource = 0
  let checked = 0
  let skipped = 0

  for (const note of all) {
    const ids = [...resourceIds(note), ...bodyResourceUris(note)]
    if (ids.length === 0) continue
    withResource++
    for (const uri of ids) {
      const parsed = parseResourceUri(uri)
      if (!parsed) {
        problems.push({
          path: note.path,
          uri,
          reason: 'unknown-prefix',
          detail: `"${uri}" is not a <kind>:<id> resource — the kinds are ${RESOURCE_PREFIXES.join(', ')}`,
        })
        continue
      }
      const resolvable = known.get(parsed.prefix)
      if (!resolvable) {
        skipped++
        continue
      }
      checked++
      if (!resolvable.has(parsed.id)) {
        problems.push({
          path: note.path,
          uri,
          reason: 'dangling',
          detail: `no ${parsed.prefix} named "${parsed.id}" exists`,
        })
      }
    }
  }

  return {
    ok: problems.length === 0,
    notes: withResource,
    checked,
    skipped,
    problems,
  }
}
