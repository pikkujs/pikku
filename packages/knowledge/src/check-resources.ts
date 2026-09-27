import { z } from 'zod'
import { type KnowledgeNote, readKnowledgeNotes, resourceIds } from './notes.js'
import {
  RESOURCE_PREFIXES,
  type ResourcePrefix,
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

export const ResourceOrphanSchema = z.object({
  uri: z.string(),
  prefix: z.string(),
  id: z.string(),
})

export type ResourceOrphan = z.infer<typeof ResourceOrphanSchema>

/**
 * The kinds whose orphans mean something.
 *
 * An orphan is a capability nobody wrote down, so the kinds worth reporting are
 * the ones that ARE capabilities. A wire (`http`, `queue`, `cron`, `channel`) is
 * a way to reach a function that is already reported, and a `schema`, `scope`,
 * `addon` or `persona` is machinery rather than something a note would be about
 * — reporting those turns a useful signal into a list nobody reads.
 */
export const ORPHAN_PREFIXES: readonly ResourcePrefix[] = [
  'func',
  'table',
  'workflow',
]

export const ResourceCheckSchema = z.object({
  ok: z.boolean(),
  /** Notes carrying a `resource:` at all. */
  notes: z.number(),
  /** URIs whose prefix had meta behind it, so the id was actually verified. */
  checked: z.number(),
  /** URIs whose prefix had no meta in this project — unverifiable, not wrong. */
  skipped: z.number(),
  problems: z.array(ResourceProblemSchema),
  /**
   * Code no note claims. Informational, and deliberately outside `ok`: a project
   * is allowed to have more code than record, and on an imported repo that is the
   * normal state rather than a fault.
   */
  orphans: z.array(ResourceOrphanSchema),
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
export type ResourceCheckOptions = {
  notes?: KnowledgeNote[]
  /**
   * Ids a profile resolves for itself, unioned with what codegen meta offers.
   *
   * A profile knows sources codegen does not — a live dev database, a config file
   * read before anything is generated — and unioning rather than replacing keeps
   * this open on ignorance: neither side knowing about an id is what makes it
   * dangling, not one side missing it.
   */
  known?: Map<ResourcePrefix, Set<string>>
  /**
   * Ids that exist for reasons no note will ever cover — a template's own auth
   * and health functions, a framework table. Subtracted from the orphan report
   * only; a note may still point at one, and it resolves.
   */
  baseline?: Map<ResourcePrefix, Set<string>>
  /** Defaults to {@link ORPHAN_PREFIXES}; an empty array turns the report off. */
  orphanPrefixes?: readonly ResourcePrefix[]
}

export const checkKnowledgeResources = async (
  root: string,
  outDir: string,
  {
    notes,
    known: extra,
    baseline,
    orphanPrefixes = ORPHAN_PREFIXES,
  }: ResourceCheckOptions = {}
): Promise<ResourceCheck> => {
  const all = notes ?? (await readKnowledgeNotes(root))
  const known = await collectKnownResources(root, outDir)
  for (const [prefix, ids] of extra ?? []) {
    const existing = known.get(prefix)
    known.set(prefix, existing ? new Set([...existing, ...ids]) : ids)
  }

  const claimed = new Set<string>()
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
      claimed.add(`${parsed.prefix}:${parsed.id}`)
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

  const orphans: ResourceOrphan[] = []
  for (const prefix of orphanPrefixes) {
    const ignored = baseline?.get(prefix)
    for (const id of known.get(prefix) ?? []) {
      const uri = `${prefix}:${id}`
      if (claimed.has(uri) || ignored?.has(id)) continue
      orphans.push({ uri, prefix, id })
    }
  }

  return {
    ok: problems.length === 0,
    notes: withResource,
    checked,
    skipped,
    problems,
    orphans,
  }
}
