import type { PikkuCLIConfig } from '../../types/config.js'

type ScenariosConfig = NonNullable<PikkuCLIConfig['scenarios']>
type ActorsConfig = NonNullable<ScenariosConfig['actors']>
type ActorConfig = ActorsConfig[string]
type PersonasConfig = NonNullable<ScenariosConfig['personas']>

/** Domain for the email of an actor nobody declared. Synthetic either way. */
const AUTO_ACTOR_EMAIL_DOMAIN = 'actors.local'

/** `orgAdmin` → `org-admin`, so a derived email reads like an email. */
const kebab = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()

/**
 * The actor registry a run actually sees: every declared actor, plus one
 * materialised actor for each persona nobody declared an actor for.
 *
 * A persona is the KIND of person (its `description`); an actor is one BODY
 * that signs in, with an email of its own. Most apps want exactly one body per
 * kind, so declaring the persona is enough — this fills in the actor. You only
 * write an actor by hand when a scenario needs TWO of the same kind, which is
 * what tenant-isolation and peer-sharing scenarios are made of.
 *
 * Every consumer must resolve through here rather than reading
 * `config.scenarios.actors` directly: codegen emits `scenarioActorConfigs` from
 * it (and `ScenarioActorName` is a `keyof` over that literal, so an actor missing
 * at codegen time can never be referenced in a typed step), while `scenario run`
 * builds the HTTP and Playwright actor maps from it. Those were already three
 * separate reads of the same field before personas existed.
 */
export const resolveScenarioActors = (
  scenarios: ScenariosConfig | undefined
): ActorsConfig => {
  const personas: PersonasConfig = scenarios?.personas ?? {}
  const declared: ActorsConfig = scenarios?.actors ?? {}
  const resolved: ActorsConfig = {}

  for (const [name, actor] of Object.entries(declared)) {
    // An actor named after a persona belongs to it without having to say so —
    // the common case is one body per kind and they share the obvious name.
    const persona = actor.persona ?? (personas[name] ? name : undefined)
    if (persona && !personas[persona]) {
      throw new Error(
        `Scenario actor '${name}' names persona '${persona}', which is not declared in scenarios.personas` +
          `${Object.keys(personas).length ? ` (declared: ${Object.keys(personas).join(', ')})` : ' (no personas are declared)'}`
      )
    }
    resolved[name] = persona ? { ...actor, persona } : actor
  }

  const claimed = new Set(
    Object.values(resolved)
      .map((actor) => actor.persona)
      .filter((persona): persona is string => Boolean(persona))
  )
  for (const [persona, config] of Object.entries(personas)) {
    if (claimed.has(persona)) continue
    // A `system` persona is the app acting on its own. There is nobody to sign
    // in, so minting an actor for it would only produce a scenario that tries.
    // Declaring one by hand is still allowed — a service account is a body.
    if (config.kind === 'system') continue
    resolved[persona] = {
      persona,
      email: `${kebab(persona)}@${AUTO_ACTOR_EMAIL_DOMAIN}`,
    }
  }

  assertDistinctEmails(resolved)
  return resolved
}

/**
 * Two actors sharing an email are the same user row — sign-in keys on email
 * alone (see `HttpScenarioActors.signIn`). That silently collapses exactly the
 * scenarios a second body exists for: an isolation scenario whose two owners
 * are one user passes by construction and proves nothing.
 */
const assertDistinctEmails = (actors: ActorsConfig) => {
  const byEmail = new Map<string, string>()
  for (const [name, actor] of Object.entries(actors)) {
    const email = actor.email.toLowerCase()
    const owner = byEmail.get(email)
    if (owner) {
      throw new Error(
        `Scenario actors '${owner}' and '${name}' share the email '${actor.email}' — they would sign in as the same user`
      )
    }
    byEmail.set(email, name)
  }
}

export type { ActorConfig as ResolvedScenarioActorConfig }
