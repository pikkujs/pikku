import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ADDONS_LOCK_FILE,
  ErrorCode,
  addonResolutionDirs,
  findInstalledPackageDir,
  readAddonsLock,
  serializeAddonsLock,
} from '@pikku/inspector'
import type {
  AddonsLock,
  InspectorState,
  ProviderLockEntry,
  ProviderMeta,
  ProviderVariantMeta,
} from '@pikku/inspector'
import { ProviderBuildError } from './provider-build-error.js'

/** Which providers `--approve-providers` accepts: all of them (`true`) or the ids it names. */
export type ProviderApproval = boolean | readonly string[]

type LockState = Pick<InspectorState, 'optedInProviders'> & {
  rpc: { wireAddonDeclarations: InspectorState['rpc']['wireAddonDeclarations'] }
}

const sorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b))

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)])
    )
  }
  return value
}

/** `sha256-<hex>` of the provider's meta as canonical JSON. */
export const providerMetaHash = (meta: ProviderMeta): string =>
  `sha256-${createHash('sha256')
    .update(JSON.stringify(canonical(meta)))
    .digest('hex')}`

const installedVersion = (
  packageDir: string | null | undefined
): string | undefined => {
  if (!packageDir) return undefined
  try {
    const version = JSON.parse(
      readFileSync(join(packageDir, 'package.json'), 'utf8')
    ).version
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  }
}

const variantsOf = (meta: ProviderMeta): ProviderVariantMeta[] =>
  Object.values(meta.variants).filter(
    (variant): variant is ProviderVariantMeta => variant !== undefined
  )

/**
 * What the project grants each addon provider it opted in to: the keys it
 * provides, the keys it reads (minus what the same addon's other opted-in
 * providers provide), the collection it adds to and the protected keys it
 * replaces. Project providers are the project's own source and are not locked.
 */
export const providerLockEntries = (
  state: LockState,
  rootDir: string
): Record<string, ProviderLockEntry> => {
  const entries: Record<string, ProviderLockEntry> = {}
  for (const [namespace, opted] of Object.entries(
    state.optedInProviders ?? {}
  )) {
    const declaration = state.rpc.wireAddonDeclarations.get(namespace)
    const version =
      installedVersion(
        findInstalledPackageDir(
          addonResolutionDirs(rootDir, declaration?.file),
          opted.packageName
        )
      ) ?? '0.0.0'
    for (const [name, meta] of Object.entries(opted.providers)) {
      const variants = variantsOf(meta)
      const provides = sorted(variants.flatMap((variant) => variant.provides))
      const providedBySiblings = new Set(
        Object.entries(opted.providers)
          .filter(([other]) => other !== name)
          .flatMap(([, sibling]) =>
            variantsOf(sibling).flatMap((variant) => variant.provides)
          )
      )
      const needed = sorted(
        variants.flatMap((variant) => variant.needs)
      ).filter((key) => !providedBySiblings.has(key))
      const optionalEverywhere = (key: string) =>
        variants
          .filter((variant) => variant.needs.includes(key))
          .every((variant) => (variant.optional ?? []).includes(key))
      entries[`${namespace}/${name}`] = {
        package: opted.packageName,
        version,
        metaHash: providerMetaHash(meta),
        kind: meta.kind ?? 'singleton',
        provides,
        optionalProvides: sorted(
          variants.flatMap((variant) => variant.optionalProvides ?? [])
        ),
        imports: needed.filter((key) => !optionalEverywhere(key)),
        optionalImports: needed.filter(optionalEverywhere),
        addsTo: meta.addTo ?? null,
        replaces: sorted(meta.replaces ?? []),
      }
    }
  }
  return entries
}

const SET_FIELDS = [
  'provides',
  'optionalProvides',
  'imports',
  'optionalImports',
  'replaces',
] as const

/** The lines that differ between what was approved and what the addon is now: `+ imports kysely`, `- provides x`. */
export const diffProviderSurface = (
  approved: ProviderLockEntry,
  current: ProviderLockEntry
): string[] => {
  const lines: string[] = []
  for (const field of SET_FIELDS) {
    const before = new Set(approved[field] ?? [])
    const after = new Set(current[field] ?? [])
    for (const key of after) {
      if (!before.has(key)) lines.push(`+ ${field} ${key}`)
    }
    for (const key of before) {
      if (!after.has(key)) lines.push(`- ${field} ${key}`)
    }
  }
  if (approved.kind !== current.kind) {
    lines.push(`- kind ${approved.kind}`, `+ kind ${current.kind}`)
  }
  if ((approved.addsTo ?? null) !== current.addsTo) {
    if (approved.addsTo) lines.push(`- addsTo ${approved.addsTo}`)
    if (current.addsTo) lines.push(`+ addsTo ${current.addsTo}`)
  }
  return lines
}

const approves = (approval: ProviderApproval, id: string): boolean =>
  approval === true || (Array.isArray(approval) && approval.includes(id))

const describeEntry = (id: string, entry: ProviderLockEntry): string =>
  `pikku: recorded addon provider '${id}' (${entry.package}@${entry.version}): provides ${entry.provides.join(', ') || 'nothing'}; imports ${entry.imports.join(', ') || 'nothing'}. Commit ${ADDONS_LOCK_FILE}.`

export interface ProviderLockResult {
  providers: Record<string, ProviderLockEntry>
  /** The ids newly recorded, for the build to announce. */
  recorded: string[]
}

/**
 * Checks the addon providers the project opted in to against the approved
 * `lock.providers`, and returns the section to write.
 *
 * - A provider the lock has not seen is recorded (PKU396 under `frozen`).
 * - A provider whose surface changed fails with PKU395 until it is approved
 *   (`approval`), and with PKU396 under `frozen`. The surface is what it
 *   provides, imports, adds to and replaces; a changed version or meta hash
 *   with the same surface is rewritten without a word, and under `frozen` it
 *   is accepted and the approved entry is kept.
 * - A provider no longer opted in is dropped (PKU396 under `frozen`).
 */
export const checkProviderLock = ({
  current,
  lock,
  frozen,
  approval = false,
}: {
  current: Record<string, ProviderLockEntry>
  lock: AddonsLock
  frozen: boolean
  approval?: ProviderApproval
}): ProviderLockResult => {
  const next: Record<string, ProviderLockEntry> = {}
  const recorded: string[] = []
  const drifted: string[] = []
  const frozenFailure = (id: string, what: string) =>
    new ProviderBuildError(
      ErrorCode.PROVIDER_LOCK_FROZEN,
      `${ADDONS_LOCK_FILE} is frozen (--frozen) but addon provider '${id}' ${what}. Run pikku all without --frozen locally and commit the lock.`
    )

  for (const [id, entry] of Object.entries(current)) {
    const approved = lock.providers[id]
    if (!approved) {
      if (frozen) throw frozenFailure(id, 'is new')
      next[id] = entry
      recorded.push(id)
      continue
    }
    const diff = diffProviderSurface(approved, entry)
    if (diff.length > 0 && !approves(approval, id)) {
      if (frozen) {
        throw new ProviderBuildError(
          ErrorCode.PROVIDER_LOCK_FROZEN,
          `${ADDONS_LOCK_FILE} is frozen (--frozen) but addon provider '${id}' changed:\n${diff.join('\n')}\nRun pikku all without --frozen locally and commit the lock.`
        )
      }
      drifted.push(
        `Addon provider '${id}' changed since ${ADDONS_LOCK_FILE} approved it:\n${diff.join('\n')}\nReview it, then run 'pikku all --approve-providers ${id}' and commit ${ADDONS_LOCK_FILE}.`
      )
      continue
    }
    next[id] = frozen ? approved : entry
  }
  if (drifted.length > 0) {
    throw new ProviderBuildError(
      ErrorCode.PROVIDER_LOCK_DRIFT,
      drifted.join('\n\n')
    )
  }
  if (frozen) {
    for (const id of Object.keys(lock.providers)) {
      if (!(id in current)) throw frozenFailure(id, 'was removed')
    }
  }
  return { providers: next, recorded }
}

/**
 * Brings the `providers` section of `pikku-addons.lock` in line with the
 * addon providers the project opted in to, leaving the `sdks` section as it
 * is. Nothing is written when the lock would not change. A project with no
 * addon providers, now or in the lock, never has its lock file touched or
 * checked, so a lock written before the `providers` section existed stays
 * as it is.
 */
export const syncProvidersLock = async ({
  state,
  rootDir,
  frozen,
  approval,
  log,
}: {
  state: LockState
  rootDir: string
  frozen: boolean
  approval?: ProviderApproval
  log: (message: string) => void
}): Promise<void> => {
  const lock = readAddonsLock(rootDir)
  const current = providerLockEntries(state, rootDir)
  const { providers, recorded } = checkProviderLock({
    current,
    lock,
    frozen,
    approval,
  })
  if (
    Object.keys(providers).length === 0 &&
    Object.keys(lock.providers).length === 0
  ) {
    return
  }
  const path = join(rootDir, ADDONS_LOCK_FILE)
  const next = serializeAddonsLock({ ...lock, providers })
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (existing !== next) {
    if (frozen) {
      throw new ProviderBuildError(
        ErrorCode.PROVIDER_LOCK_FROZEN,
        `${ADDONS_LOCK_FILE} is frozen (--frozen) but is not in the form pikku writes it. Run pikku all without --frozen locally and commit the lock.`
      )
    }
    await writeFile(path, next)
  }
  for (const id of recorded) log(describeEntry(id, providers[id]!))
}
