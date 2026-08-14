import { diffSchema, type SchemaChange } from './schema-diff.js'
import type { Surface, WiringCategory } from './surface.js'

/**
 * Turn two surfaces into the release verdict and the reasons behind it.
 *
 * The three rules, in order: anything a client depended on that is gone or
 * tightened is **major**; anything new or compatibly loosened is **minor**;
 * a surface that did not move at all is **patch** — the release is internal
 * work, which is the only thing left for it to be.
 */

export type Verdict = 'major' | 'minor' | 'patch'
export type ChangeKind = 'function' | WiringCategory
export type ChangeStatus = 'added' | 'removed' | 'modified'

export interface SurfaceChange {
  kind: ChangeKind
  id: string
  status: ChangeStatus
  breaking: boolean
  reasons: string[]
}

export interface SurfaceChanges {
  schemaVersion: number
  generatedAt: string
  /** The `--against` value, recorded so the artifact says what it is relative to. */
  baseline: string
  verdict: Verdict
  summary: {
    breaking: number
    added: number
    removed: number
    modified: number
  }
  changes: SurfaceChange[]
}

export const CHANGES_SCHEMA_VERSION = 1

const STATUS_ORDER: Record<ChangeStatus, number> = {
  removed: 0,
  modified: 1,
  added: 2,
}

const describe = (change: SchemaChange, side: 'input' | 'output') =>
  `${side}${change.path ? `.${change.path}` : ''}: ${change.reason}`

/**
 * Published versions are immutable, so a function id that vanished from the
 * source is still being served while the manifest records it — that is a `@vN`
 * bump, not a removal.
 */
function stillPublished(
  surface: Surface,
  key: string,
  version: number
): boolean {
  return (surface.publishedVersions[key] ?? []).includes(version)
}

function diffFunctions(
  before: Surface,
  after: Surface,
  changes: SurfaceChange[]
): void {
  const ids = new Set([
    ...Object.keys(before.functions),
    ...Object.keys(after.functions),
  ])

  for (const id of [...ids].sort()) {
    const previous = before.functions[id]
    const current = after.functions[id]

    if (previous && !current) {
      const superseded = stillPublished(after, previous.key, previous.version)
      changes.push({
        kind: 'function',
        id,
        status: 'removed',
        breaking: !superseded,
        reasons: [
          superseded
            ? `no longer in the source, but v${previous.version} is still published in versions.pikku.json`
            : 'function removed',
        ],
      })
      continue
    }

    if (!previous && current) {
      const priorVersions = before.publishedVersions[current.key] ?? []
      changes.push({
        kind: 'function',
        id,
        status: 'added',
        breaking: false,
        reasons: [
          priorVersions.length > 0
            ? `new version of ${current.key} (previously v${priorVersions.join(', v')})`
            : 'function added',
        ],
      })
      continue
    }

    if (!previous || !current) continue

    const reasons: string[] = []
    let breaking = false

    const pairs = [
      {
        side: 'input' as const,
        before: previous.inputSchemaName,
        after: current.inputSchemaName,
      },
      {
        side: 'output' as const,
        before: previous.outputSchemaName,
        after: current.outputSchemaName,
      },
    ]

    let unresolved = false
    for (const pair of pairs) {
      const beforeSchema = pair.before ? before.schemas[pair.before] : undefined
      const afterSchema = pair.after ? after.schemas[pair.after] : undefined
      // A named schema whose body did not travel with the snapshot cannot be
      // compared; fall through to the hash so it is never silently "unchanged".
      if (
        (pair.before && beforeSchema === undefined) ||
        (pair.after && afterSchema === undefined)
      ) {
        unresolved = true
        continue
      }
      for (const change of diffSchema(beforeSchema, afterSchema, pair.side)) {
        if (change.breaking) breaking = true
        reasons.push(describe(change, pair.side))
      }
    }

    if (
      unresolved &&
      previous.contractHash !== undefined &&
      current.contractHash !== undefined &&
      previous.contractHash !== current.contractHash
    ) {
      // The contract moved but the schemas were not available to say how.
      // Treating that as compatible would be a guess in the unsafe direction.
      breaking = true
      reasons.push(
        'contract hash changed, and the schemas were not available to determine whether it is breaking'
      )
    }

    if (reasons.length > 0) {
      changes.push({
        kind: 'function',
        id,
        status: 'modified',
        breaking,
        reasons,
      })
    }
  }
}

const authRequired = (meta: unknown): boolean =>
  !!meta &&
  typeof meta === 'object' &&
  (meta as { auth?: boolean }).auth === true

function diffWirings(
  before: Surface,
  after: Surface,
  changes: SurfaceChange[]
): void {
  const categories = new Set<WiringCategory>([
    ...(Object.keys(before.wirings) as WiringCategory[]),
    ...(Object.keys(after.wirings) as WiringCategory[]),
  ])

  for (const category of [...categories].sort()) {
    const previous = before.wirings[category] ?? {}
    const current = after.wirings[category] ?? {}
    const ids = new Set([...Object.keys(previous), ...Object.keys(current)])

    for (const id of [...ids].sort()) {
      const inBefore = id in previous
      const inAfter = id in current

      if (inBefore && !inAfter) {
        changes.push({
          kind: category,
          id,
          status: 'removed',
          breaking: true,
          reasons: [`${category} wiring removed`],
        })
      } else if (!inBefore && inAfter) {
        changes.push({
          kind: category,
          id,
          status: 'added',
          breaking: false,
          reasons: [`${category} wiring added`],
        })
      } else if (JSON.stringify(previous[id]) !== JSON.stringify(current[id])) {
        // Requiring a session on something that did not is the one wiring-level
        // change that shuts out existing callers outright.
        const closed = !authRequired(previous[id]) && authRequired(current[id])
        changes.push({
          kind: category,
          id,
          status: 'modified',
          breaking: closed,
          reasons: [
            closed
              ? `${category} wiring now requires authentication`
              : `${category} wiring changed`,
          ],
        })
      }
    }
  }
}

export function computeSurfaceDiff(
  before: Surface,
  after: Surface,
  baseline: string
): SurfaceChanges {
  const changes: SurfaceChange[] = []
  diffFunctions(before, after, changes)
  diffWirings(before, after, changes)

  changes.sort(
    (a, b) =>
      Number(b.breaking) - Number(a.breaking) ||
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.kind.localeCompare(b.kind) ||
      a.id.localeCompare(b.id)
  )

  const summary = {
    breaking: changes.filter((c) => c.breaking).length,
    added: changes.filter((c) => c.status === 'added').length,
    removed: changes.filter((c) => c.status === 'removed').length,
    modified: changes.filter((c) => c.status === 'modified').length,
  }

  const verdict: Verdict =
    summary.breaking > 0 ? 'major' : changes.length > 0 ? 'minor' : 'patch'

  return {
    schemaVersion: CHANGES_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    baseline,
    verdict,
    summary,
    changes,
  }
}
