import type {
  VirtualUserDefinitions,
  VirtualUserMeta,
  VirtualUsersMeta,
} from './virtual-user-declaration.types.js'

/**
 * Whether a virtual user can actually be run.
 *
 * A provider login cannot: driving Google's or GitHub's consent screen needs a
 * human, so the virtual user is seedable and assertable but not runnable. Derived
 * rather than asked for, because it is a consequence of the account rather than
 * a separate decision — and a flag someone must remember to set is a flag that
 * ships wrong.
 *
 * An explicit `runnable: false` still wins: it marks the person who is only
 * ever acted *upon*, which no account shape reveals.
 */
export const isRunnableVirtualUser = (virtualUser: {
  runnable?: boolean
  account?: { provider?: string }
}): boolean => {
  if (virtualUser.runnable === false) {
    return false
  }
  return virtualUser.account?.provider === undefined
}

/**
 * Validates declared virtual users and keys them by id.
 *
 * Definitions sharing an id must be identical; a conflicting redeclaration is a
 * hard error naming both source files, on the same terms as scopes and roles.
 */
export function validateAndBuildVirtualUsersMeta(
  definitions: VirtualUserDefinitions
): VirtualUsersMeta {
  const meta: VirtualUsersMeta = {}

  for (const virtualUser of definitions) {
    if (!virtualUser.id) {
      throw new Error('A virtual user is declared with an empty id.')
    }
    if (!virtualUser.name) {
      throw new Error(
        `VirtualUser '${virtualUser.id}' has no name. A virtual user is a person; give them one.`
      )
    }

    const existing = meta[virtualUser.id]
    if (existing) {
      const same =
        JSON.stringify({ ...existing, sourceFile: undefined }) ===
        JSON.stringify({ ...virtualUser, sourceFile: undefined })
      if (!same) {
        throw new Error(
          `VirtualUser '${virtualUser.id}' is declared twice with different content.\n` +
            `  First declaration: ${existing.sourceFile ?? 'unknown'}\n` +
            `  Second declaration: ${virtualUser.sourceFile ?? 'unknown'}`
        )
      }
      continue
    }

    meta[virtualUser.id] = virtualUser
  }

  return meta
}

/** What a run compares against the store before its first step. */
export interface RoleVerification {
  virtualUser: string
  expected: string[]
  actual: string[]
  missing: string[]
  extra: string[]
  ok: boolean
}

/**
 * Compares a virtual user's declared roles against what the stage actually granted.
 *
 * Run at sign-in, before the first step. The declaration is authoritative —
 * the generated seed applies it — but pikku cannot guarantee the seed ran on a
 * stage it did not deploy, and virtual users are meant to run against staging
 * and production, so that case is the normal one.
 *
 * Both directions matter, for opposite reasons. An under-granted virtual user
 * reports authorization bugs that are really seed drift. An over-granted one
 * silently stops testing the boundary it was written to test — nothing fails,
 * the findings just quietly stop being about anything.
 */
export const verifyVirtualUserRoles = (
  virtualUser: string,
  expected: readonly string[],
  actual: readonly string[]
): RoleVerification => {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  const missing = [...expectedSet].filter((r) => !actualSet.has(r)).sort()
  const extra = [...actualSet].filter((r) => !expectedSet.has(r)).sort()
  return {
    virtualUser,
    expected: [...expectedSet].sort(),
    actual: [...actualSet].sort(),
    missing,
    extra,
    ok: missing.length === 0 && extra.length === 0,
  }
}

/** The message a run stops with, or `null` when the roles line up. */
export const roleMismatchMessage = (
  verification: RoleVerification
): string | null => {
  if (verification.ok) {
    return null
  }
  const parts: string[] = []
  if (verification.missing.length) {
    parts.push(`missing ${verification.missing.join(', ')}`)
  }
  if (verification.extra.length) {
    parts.push(`unexpectedly holds ${verification.extra.join(', ')}`)
  }
  return (
    `VirtualUser '${verification.virtualUser}' ${parts.join(' and ')}. ` +
    `Declared: ${verification.expected.join(', ') || 'none'}. ` +
    `On the stage: ${verification.actual.join(', ') || 'none'}. ` +
    `Refusing to run — findings from a virtual user whose roles have drifted are about the seed, not the product.`
  )
}

/** Convenience: the meta a run needs, with `runnable` already resolved. */
export const runnableVirtualUsers = (meta: VirtualUsersMeta): VirtualUserMeta[] =>
  Object.values(meta).filter((virtualUser) => virtualUser.runnable)
