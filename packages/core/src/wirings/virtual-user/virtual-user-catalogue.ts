import type { ApiCatalogueEntry } from './virtual-user.types.js'

/**
 * Endpoint names that only read, by convention. Used when nobody annotated
 * `readonly` — which in a real project is most of them.
 */
const READ_PREFIXES = [
  'get',
  'list',
  'lookup',
  'search',
  'find',
  'read',
  'fetch',
  'check',
  'count',
  'query',
  'preview',
  'describe',
  'has',
  'is',
]

/**
 * Whether a call only reads.
 *
 * An explicit annotation always wins. Without one, the name decides — because
 * an unannotated function means "nobody said", not "safe", and silently
 * treating 395 unannotated endpoints as read-only is how a virtual user
 * deploys something. {@link catalogueClassification} reports how much of the
 * catalogue rests on this guess so the gap is visible rather than assumed.
 */
export const isReadOnly = (entry: ApiCatalogueEntry): boolean => {
  if (typeof entry.readonly === 'boolean') return entry.readonly
  const name = entry.name
  return READ_PREFIXES.some(
    (prefix) =>
      name.startsWith(prefix) &&
      (name.length === prefix.length ||
        name[prefix.length] === name[prefix.length]?.toUpperCase())
  )
}

/** How much of a catalogue's read/write split is annotation and how much is guess. */
export const catalogueClassification = (
  entries: readonly ApiCatalogueEntry[]
) => {
  const annotated = entries.filter(
    (entry) => typeof entry.readonly === 'boolean'
  ).length
  return {
    total: entries.length,
    annotated,
    inferred: entries.length - annotated,
  }
}

/** One catalogue line: `name(inputKeys) -> outputKeys — description`. */
const renderEntry = (entry: ApiCatalogueEntry): string => {
  const inputs = (entry.inputKeys ?? []).join(',')
  const outputs = (entry.outputKeys ?? []).join(',')
  const description = entry.description
    ? ` — ${entry.description.split('\n')[0]!.slice(0, 120)}`
    : ''
  return `${entry.name}(${inputs})${outputs ? ` -> ${outputs}` : ''}${description}`
}

/**
 * The whole reachable API as one compact index, for the instructions.
 *
 * Every endpoint is listed rather than retrieved against. Measured on a 430-RPC
 * project this is ~8k tokens, cached for the life of the run — cheaper than any
 * retrieval step, and it hides nothing. A ranking function would make the
 * virtual user only as adventurous as the ranking, which loses exactly the
 * endpoints worth stumbling into.
 */
export const renderCatalogue = (
  entries: readonly ApiCatalogueEntry[]
): string => entries.map(renderEntry).join('\n')

/**
 * The entries a given user may reach: approval-gated calls dropped unless the
 * run opted in, mutations dropped for a read-only disposition, and anything the
 * actor's tier cannot satisfy dropped when the caller supplied one.
 *
 * This narrows *what is offered*, never what is enforced — the server is the
 * only thing that decides who may call what, and a call this filter would have
 * denied still going through is a finding rather than a bug in the filter.
 */
export const reachableCatalogue = (
  entries: readonly ApiCatalogueEntry[],
  {
    readOnly = false,
    allowApprovalRequired = false,
    grants,
  }: {
    readOnly?: boolean
    allowApprovalRequired?: boolean
    /** Permission names this actor satisfies. Omit to keep every entry. */
    grants?: readonly string[]
  } = {}
): ApiCatalogueEntry[] =>
  entries.filter((entry) => {
    if (entry.approvalRequired && !allowApprovalRequired) return false
    if (readOnly && !isReadOnly(entry)) return false
    if (grants && entry.permissions?.length) {
      return entry.permissions.every((permission) =>
        grants.includes(permission)
      )
    }
    return true
  })

/** Index a catalogue by name for the engine's lookups. */
export const catalogueIndex = (
  entries: readonly ApiCatalogueEntry[]
): Map<string, ApiCatalogueEntry> =>
  new Map(entries.map((entry) => [entry.name, entry]))

/**
 * What `describe` hands back: the full schemas, so the next call can be made
 * correctly rather than guessed at.
 *
 * Guessing field names is unproductive fuzz — every 400 becomes a typo and
 * nothing is learned from any of them. Reading the schema first is also what a
 * person does, since the form tells them the fields. It makes a subsequent 400
 * mean something: either the schema and the implementation disagree, or the
 * misuse is genuine and worth seeing.
 */
export const describeEntry = (entry: ApiCatalogueEntry) => ({
  name: entry.name,
  description: entry.description,
  readonly: isReadOnly(entry),
  approvalRequired: entry.approvalRequired ?? false,
  input: entry.inputSchema ?? { type: 'object', properties: {} },
  output: entry.outputSchema ?? null,
})
