import type { Logger, ResolvedPersona, ScopeService } from '@pikku/core/services'
import type { PersonaEnvironment } from '@pikku/core/persona'
import { personaEnvironmentRefusal } from '@pikku/core/persona'

import type { AuthGetter } from './admin-users.js'

/**
 * What provisioning needs off the app's singleton services.
 *
 * A structural subset rather than the app's `SingletonServices`, so this can be
 * called from a lifecycle hook, a scaffolded seed or a test without any of them
 * having to name the same type.
 */
export interface ProvisionPersonasServices {
  auth: AuthGetter
  scopeService: Pick<ScopeService, 'addUserToRole' | 'listUserRoles'>
  logger: Pick<Logger, 'info' | 'warn'>
}

export interface ProvisionPersonasOptions {
  /** Persona id → the declaration with its address filled in — `personaConfigs`. */
  personas: Record<string, ResolvedPersona>
  /** `environments` from pikku.config.json, as generated beside the personas. */
  environments: Readonly<Record<string, PersonaEnvironment>>
  /** Which of them this process is. Defaults to `PIKKU_ENV`. */
  environment?: string
}

export interface ProvisionPersonasResult {
  created: number
  granted: number
  held: number
  /** One line per persona that may not act here, saying why. */
  skipped: string[]
}

type ActorUser = { id: string; actor?: boolean } & Record<string, unknown>

/**
 * Provision the declared personas into the environment this process is running
 * in: their accounts, and the roles they declare.
 *
 * Runs where the database is, which is the whole point. `pikku persona sync`
 * reached for a Kysely connection built from the local project config, so it
 * only ever provisioned a deployment whose database the developer's machine
 * could open — true of a local stage and of nothing else. The server has that
 * connection by definition, so this is a call an app makes from its own
 * `afterStart`, and a deploy carries the personas with it.
 *
 * Accounts are created through better-auth's internal adapter — the same call
 * the actor endpoint makes — rather than by inserting a `user` row directly, so
 * the id shape, the column set and any adapter-level hooks are better-auth's
 * business and not a thing to be reimplemented against its schema.
 *
 * Additive in the same way `syncSystemRoles` is: it creates and grants, never
 * deletes or revokes. Removing a persona from the code leaves the account and
 * its grants standing until somebody decides otherwise — the alternative is a
 * rolling deploy quietly locking out a persona the older replica is still
 * using.
 *
 * A persona that may not act in this environment is skipped rather than
 * refused: the same rule that decides who may *run* here decides who is
 * provisioned here, so a production deploy creates the accountable personas and
 * leaves the rest uncreated. An address already held by a real (non-actor) user
 * throws, because granting a persona's roles to somebody else's account is not
 * a thing to do quietly.
 */
export const provisionPersonas = async (
  { auth, scopeService, logger }: ProvisionPersonasServices,
  {
    personas,
    environments,
    environment = typeof process === 'undefined'
      ? undefined
      : process.env.PIKKU_ENV,
  }: ProvisionPersonasOptions
): Promise<ProvisionPersonasResult> => {
  const result: ProvisionPersonasResult = {
    created: 0,
    granted: 0,
    held: 0,
    skipped: [],
  }

  const entries = Object.entries(personas)
  if (entries.length === 0) {
    return result
  }

  if (!auth) {
    throw new Error(
      'Provisioning personas requires better-auth to be wired (services.auth is missing)'
    )
  }
  const ctx = (await auth()).$context as any

  for (const [id, persona] of entries) {
    const refusal = personaEnvironmentRefusal(
      id,
      persona,
      environment,
      environments
    )
    if (refusal) {
      result.skipped.push(refusal)
      continue
    }

    const email = persona.email.toLowerCase()
    const existing = (await ctx.internalAdapter.findUserByEmail(email))?.user as
      | ActorUser
      | undefined
    if (existing && !existing.actor) {
      throw new Error(
        `${email} is a real user here, not an actor. Refusing to grant persona '${id}' the roles of somebody else's account — give the persona an address of its own.`
      )
    }

    let user = existing
    if (!user) {
      user = (await ctx.internalAdapter.createUser({
        email,
        name: persona.name,
        emailVerified: true,
        actor: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as ActorUser | undefined
      if (!user) {
        throw new Error(`Failed to create an actor account for persona '${id}'`)
      }
      result.created++
    }

    const roles = persona.roles ?? []
    if (roles.length === 0) {
      continue
    }
    const already = new Set(await scopeService.listUserRoles(user.id))
    for (const role of roles) {
      if (already.has(role)) {
        result.held++
        continue
      }
      await scopeService.addUserToRole(user.id, role)
      result.granted++
    }
  }

  logger.info(
    `personas: ${result.created} account(s) created, ${result.granted} role grant(s) applied, ${result.held} already held` +
      (result.skipped.length
        ? `, ${result.skipped.length} persona(s) skipped — they do not act in '${environment ?? 'an unresolved environment'}'`
        : '')
  )
  for (const skipped of result.skipped) {
    logger.info(`  ${skipped}`)
  }

  return result
}
