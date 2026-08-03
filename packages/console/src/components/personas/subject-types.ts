import type { PersonaScenarioRef } from './persona-types'

/**
 * Who is acting, when it is not a person.
 *
 * `platform` is the app acting on itself — "the platform has expired the
 * trial". `addon` is a third-party system acting — "Stripe's webhook arrives".
 * Both are declarations of their own rather than personas with an asterisk,
 * for the reason `pikkuPlatformScenarioStep` gives: a persona is a person.
 */
export type SubjectKind = 'platform' | 'addon'

/** One step this subject can be made to take. */
export interface SubjectStepRef {
  name: string
  displayName: string
  sourceFile?: string
}

/**
 * A non-human actor, as the console reads it.
 *
 * It sits on the personas page because the question "who acts in this product"
 * has three answers and hiding two of them makes the third look complete — but
 * it is behind its own filter, and the page opens on the people.
 */
export interface SubjectEntry {
  kind: SubjectKind
  key: string
  /**
   * The subject's own identifier — `'platform'`, or the addon's name. What the
   * row prints is console copy chosen by `kind`, which is why there is no
   * display name here: the platform is called something different in every
   * language, and an addon is not called anything else in any of them.
   */
  name: string
  /** Addon subjects only: the name its `wireAddon` declares. */
  addon?: string
  /** The steps declared for this subject. */
  steps: SubjectStepRef[]
  /** The scenarios that take one of those steps. */
  scenarios: PersonaScenarioRef[]
  /** The names of the features those scenarios belong to. */
  features: string[]
}
