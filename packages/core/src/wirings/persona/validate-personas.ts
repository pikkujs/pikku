import type {
  PersonaDefinitions,
  PersonaMeta,
  PersonasMeta,
} from './persona.types.js'

/**
 * Whether a persona can actually be driven by a virtual user.
 *
 * A provider login cannot: driving Google's or GitHub's consent screen needs a
 * human, so the persona is seedable and assertable but not runnable. Derived
 * rather than asked for, because it is a consequence of the account rather than
 * a separate decision — and a flag someone must remember to set is a flag that
 * ships wrong.
 *
 * An explicit `runnable: false` still wins: it marks the person who is only
 * ever acted *upon*, which no account shape reveals.
 */
export const isRunnablePersona = (persona: {
  runnable?: boolean
  account?: { provider?: string }
}): boolean => {
  if (persona.runnable === false) {
    return false
  }
  return persona.account?.provider === undefined
}

/**
 * Validates declared personas and keys them by id.
 *
 * Definitions sharing an id must be identical; a conflicting redeclaration is a
 * hard error naming both source files, on the same terms as scopes and roles.
 */
export function validateAndBuildPersonasMeta(
  definitions: PersonaDefinitions
): PersonasMeta {
  const meta: PersonasMeta = {}

  for (const persona of definitions) {
    if (!persona.id) {
      throw new Error('A persona is declared with an empty id.')
    }
    if (!persona.name) {
      throw new Error(
        `Persona '${persona.id}' has no name. A persona is a person; give them one.`
      )
    }

    const existing = meta[persona.id]
    if (existing) {
      const same =
        JSON.stringify({ ...existing, sourceFile: undefined }) ===
        JSON.stringify({ ...persona, sourceFile: undefined })
      if (!same) {
        throw new Error(
          `Persona '${persona.id}' is declared twice with different content.\n` +
            `  First declaration: ${existing.sourceFile ?? 'unknown'}\n` +
            `  Second declaration: ${persona.sourceFile ?? 'unknown'}`
        )
      }
      continue
    }

    meta[persona.id] = persona
  }

  return meta
}

/** What a run compares against the store before its first step. */
export interface RoleVerification {
  persona: string
  expected: string[]
  actual: string[]
  missing: string[]
  extra: string[]
  ok: boolean
}

/**
 * Compares a persona's declared roles against what the stage actually granted.
 *
 * Run at sign-in, before the first step. The declaration is authoritative —
 * the generated seed applies it — but pikku cannot guarantee the seed ran on a
 * stage it did not deploy, and virtual users are meant to run against staging
 * and production, so that case is the normal one.
 *
 * Both directions matter, for opposite reasons. An under-granted persona
 * reports authorization bugs that are really seed drift. An over-granted one
 * silently stops testing the boundary it was written to test — nothing fails,
 * the findings just quietly stop being about anything.
 */
export const verifyPersonaRoles = (
  persona: string,
  expected: readonly string[],
  actual: readonly string[]
): RoleVerification => {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  const missing = [...expectedSet].filter((r) => !actualSet.has(r)).sort()
  const extra = [...actualSet].filter((r) => !expectedSet.has(r)).sort()
  return {
    persona,
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
    `Persona '${verification.persona}' ${parts.join(' and ')}. ` +
    `Declared: ${verification.expected.join(', ') || 'none'}. ` +
    `On the stage: ${verification.actual.join(', ') || 'none'}. ` +
    `Refusing to run — findings from a persona whose roles have drifted are about the seed, not the product.`
  )
}

/** Convenience: the meta a run needs, with `runnable` already resolved. */
export const runnablePersonas = (meta: PersonasMeta): PersonaMeta[] =>
  Object.values(meta).filter((persona) => persona.runnable)
