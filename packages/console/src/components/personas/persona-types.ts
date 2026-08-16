import type { VirtualUserDisposition } from '@pikku/core/virtual-user'

export interface PersonaScenarioRef {
  name: string
  displayName: string
}

/** One of a persona's system roles, resolved to what it actually confers. */
export interface PersonaRoleRef {
  name: string
  displayName?: string
  description?: string
  scopes: string[]
  /**
   * False when the meta carries no such role.
   *
   * The build refuses a persona naming an undeclared role, so this can only be
   * meta that has drifted behind the code — worth saying out loud, because the
   * alternative is a role rendered as conferring nothing.
   */
  declared: boolean
}

/** One of a persona's logins, named. */
export interface PersonaAccountRef {
  /** `'primary'` for the persona's own account; the declared key otherwise. */
  name: string
  provider?: string
}

/**
 * A declared person, as the console reads them.
 *
 * Everything `definePersonas()` says about someone, plus the two joins that
 * only make sense once the whole project is in view: the scopes their roles
 * expand to, and the scenarios that cast them.
 */
export interface PersonaEntry {
  key: string
  name: string
  email: string
  jobTitle?: string
  description?: string
  /** Declared, never derived. Absent means the generated colour-and-icon avatar. */
  avatarUrl?: string
  personality?: string
  goals: string[]
  tags: string[]
  /** The roles this person holds, each resolved to the scopes it grants. */
  roles: PersonaRoleRef[]
  /** Those roles' scopes, merged and sorted — what this person can reach. */
  scopes: string[]
  disposition?: VirtualUserDisposition
  /** Absent means "everywhere but production", which the console does not resolve. */
  environments?: string[]
  runnable: boolean
  accounts: PersonaAccountRef[]
  fixtures: string[]
  sourceFile?: string
  /** The scenarios that cast this persona. */
  scenarios: PersonaScenarioRef[]
  /** The names of the features those scenarios belong to. */
  features: string[]
}

export interface PersonaRef {
  key: string
  name?: string
  jobTitle?: string
}
