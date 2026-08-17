import type { VirtualUserDisposition } from '../virtual-user/virtual-user.types.js'
import type { VirtualUserTuning } from '../virtual-user/virtual-user-dispositions.js'

/**
 * One login belonging to a persona.
 *
 * Deliberately near-empty in the common case: the address is computed from the
 * persona's name and the run id, and the password derives from
 * `SCENARIO_ACTOR_SECRET`, so there is nothing left to write down. It fills up
 * only for a provider login.
 *
 * Shaped after better-auth's `account` table, which is what most pikku apps are
 * actually running: `providerId` plus the provider's own id, and no email
 * column — the address belongs to the person, not the login.
 */
export type CorePersonaAccount = {
  /**
   * The identity provider, e.g. `'google'`. Omit for email and password.
   *
   * A provider account is declarable but not runnable: driving its consent
   * screen needs a human, so `pikku persona run` refuses rather than failing
   * somewhere inside a browser.
   */
  provider?: string
}

/**
 * A person who uses your product: a name, a job, a temperament, and what they
 * are trying to get done.
 *
 * This is Cooper's persona — "a fictional character created to represent a user
 * type" — with the two things a synthetic user additionally needs: the roles
 * that say what they may do, and the account they log in with. A persona while
 * running is a virtual user; there is no second declaration for that.
 */
export type CorePersona = {
  /** The person's name, as a person would give it. */
  name: string
  jobTitle?: string
  description?: string
  /**
   * A picture of this person, as any URL a browser can load: a file your app
   * serves, an asset on a CDN, a Gravatar link.
   *
   * Optional because it is decoration. Omitted, the console draws a colour and
   * an icon derived from the persona's id, which is stable, needs no network and
   * is more legible than the identicon a synthetic address would resolve to —
   * which is also why nothing is derived here.
   */
  avatarUrl?: string
  /**
   * The roles this person holds. Only system roles may be named — a custom
   * role can be deleted from the console, so a persona pinned to one silently
   * stops testing what it claims to.
   *
   * These are granted, not merely recorded: the generated seed applies them,
   * and a run verifies them at sign-in.
   */
  roles?: string[]
  /**
   * How they behave and talk, in prose. Temperament, not permissions — "reads
   * other people's ids out of urls" belongs here; "can see reports and nothing
   * else" is a role wearing a personality.
   */
  personality?: string
  /**
   * What they durably want. A run may append situational goals; it never
   * replaces these, because a run that replaces Susan's goals is not Susan.
   */
  goals?: string[]
  tags?: string[]
  /** Default mechanical behaviour. A run may override it. */
  disposition?: VirtualUserDisposition
  /** Overrides for that disposition's dials. */
  tuning?: VirtualUserTuning
  /** Fixture paths this person may upload, relative to the project root. */
  fixtures?: string[]
  /** Their login. `{}` — email and password — is the normal case. */
  account?: CorePersonaAccount
  /**
   * Further logins belonging to the same human, keyed by name.
   *
   * Rare, and shaped that way on purpose. All of them share the persona's one
   * computed address: better-auth's `allowDifferentEmails` defaults to false,
   * so distinct addresses would be refused linking by the library under test.
   */
  linkedAccounts?: Record<string, CorePersonaAccount>
  /**
   * The environments this person may run against, by config key.
   *
   * Omitted means every environment **except** the ones flagged
   * `production: true`. Production is opt-in for everybody, so nothing reaches
   * it by being forgotten — and naming one requires
   * `disposition: 'accountable'`, which the inspector enforces and sign-in
   * re-checks.
   */
  environments?: string[]
  /**
   * False for a person who is only ever acted *upon* — the account an admin
   * bans, the colleague a document is shared with. Declared and seeded, never
   * run. Defaults to true.
   *
   * An assertion, not something inferred from the absence of a disposition:
   * `target` *must not* run, because a run signing in as her would race the
   * scenario banning her. "Nobody has given this persona a disposition yet" is
   * a different state, and collapsing the two turns a deliberate constraint
   * into a flaky suite.
   */
  runnable?: boolean
  /**
   * The app this person signs into, when the product is more than one frontend.
   *
   * A person uses one of them — staff their app, customers theirs — and that is
   * what decides where a browser step navigates: `/dashboard` is a different
   * page in each, so the actor settles which one without the scenario saying.
   * The runner takes the base url per app (`--app-url <app>=<url>`, or
   * `appUrls` on the environment) and each actor browses against its own.
   *
   * Omitted is the normal case: one app, one url, nothing to say.
   */
  app?: string
}

/** Personas to declare, keyed by id. */
export type CorePersonas = Record<string, CorePersona>

export type PersonaAccountMeta = {
  provider?: string
}

export type PersonaMeta = {
  /** The key it was declared under. */
  id: string
  name: string
  jobTitle?: string
  description?: string
  avatarUrl?: string
  roles: string[]
  personality?: string
  goals: string[]
  tags: string[]
  disposition?: VirtualUserDisposition
  tuning?: VirtualUserTuning
  fixtures?: string[]
  account?: PersonaAccountMeta
  linkedAccounts?: Record<string, PersonaAccountMeta>
  /** Absent means "everywhere but production", which is resolved, not stored. */
  environments?: string[]
  runnable: boolean
  /** The app this person signs into; picks their base url on a browser run. */
  app?: string
  sourceFile?: string
}

export type PersonaDefinitions = PersonaMeta[]
export type PersonasMeta = Record<string, PersonaMeta>
