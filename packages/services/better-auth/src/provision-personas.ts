import type { Logger, ResolvedPersona, ScopeService } from '@pikku/core/services'
import type { PersonaEnvironment } from '@pikku/core/persona'
import { personaEnvironmentRefusal } from '@pikku/core/persona'

import type { AuthGetter } from './admin-users.js'
import { setAuthUserBanned } from './admin-users.js'
import { BAN_PLUGIN_ID } from './ban-plugin.js'

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

/**
 * What to do with an actor account no declared persona claims here.
 *
 * `report` names them and changes nothing, which is the default because a
 * rolling deploy runs the new replica's provisioning while the old replica is
 * still serving: for the length of that overlap, "no persona claims this" is
 * a statement about the *newer* declaration only.
 *
 * `ban` shuts sign-in for them, through the same `banned` column the console's
 * ban RPC writes. The row, its grants and its history all survive, so it is
 * reversible — and provisioning lifts the ban again by itself if the persona
 * comes back. Deleting the account is deliberately not offered: an actor row is
 * referenced by whatever those scenarios did while it existed.
 */
export type PersonaOrphanPolicy = 'report' | 'ban'

export interface ProvisionPersonasOptions {
  /** Persona id → the declaration with its address filled in — `personaConfigs`. */
  personas: Record<string, ResolvedPersona>
  /** `environments` from pikku.config.json, as generated beside the personas. */
  environments: Readonly<Record<string, PersonaEnvironment>>
  /** Which of them this process is. Defaults to `PIKKU_ENV`. */
  environment?: string
  /** What to do with actor accounts no declared persona claims. Defaults to `report`. */
  orphans?: PersonaOrphanPolicy
}

export interface ProvisionPersonasResult {
  created: number
  granted: number
  held: number
  /** One line per persona that may not act here, saying why. */
  skipped: string[]
  /** Addresses of actor accounts no declared persona claims here. */
  orphaned: string[]
  /** How many of those were banned, which is none unless `orphans: 'ban'`. */
  banned: number
  /** Accounts whose ban was lifted because their persona came back. */
  unbanned: number
}

type ActorUser = {
  id: string
  email?: string
  actor?: boolean
  banned?: boolean
} & Record<string, unknown>

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
 * The reverse direction is `orphans`. Provisioning is otherwise additive in the
 * same way `syncSystemRoles` is, which leaves a real hole: an account for a
 * persona you deleted keeps its grants, and the actor endpoint authenticates on
 * the `actor` column alone without ever consulting the declaration — so an
 * `admin` persona nobody declares any more is still a live way in wherever that
 * endpoint is open. `orphans: 'ban'` closes it. See {@link PersonaOrphanPolicy}
 * for why that is opt-in rather than the default.
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
    orphans = 'report',
  }: ProvisionPersonasOptions
): Promise<ProvisionPersonasResult> => {
  const result: ProvisionPersonasResult = {
    created: 0,
    granted: 0,
    held: 0,
    skipped: [],
    orphaned: [],
    banned: 0,
    unbanned: 0,
  }

  const entries = Object.entries(personas)

  // Removing the last persona is the one case where there is no work to do and
  // an orphan sweep is exactly the work that was asked for, so only `report`
  // gets to return before the auth context is even resolved.
  if (entries.length === 0 && orphans === 'report') {
    return result
  }

  if (!auth) {
    throw new Error(
      'Provisioning personas requires better-auth to be wired (services.auth is missing)'
    )
  }
  const ctx = (await auth()).$context as any

  const banAvailable =
    typeof ctx.hasPlugin === 'function'
      ? Boolean(ctx.hasPlugin(BAN_PLUGIN_ID))
      : Boolean(
          ctx.options?.plugins?.some((plugin: any) => plugin?.id === BAN_PLUGIN_ID)
        )
  if (orphans === 'ban' && !banAvailable) {
    throw new Error(
      `orphans: 'ban' needs the ban() plugin wired — without it there is no 'banned' column to write. Add it to your auth plugins, or use orphans: 'report'.`
    )
  }

  const claimed = new Set<string>()

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
    claimed.add(email)
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
    } else if (banAvailable && user.banned) {
      // The persona came back. Leaving the ban standing would make a
      // re-declared persona permanently unusable, with nothing in the
      // declaration to explain why.
      await setAuthUserBanned(auth, { userId: user.id, banned: false })
      result.unbanned++
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

  // Every actor row, not only the ones this run touched: what makes an account
  // an orphan is that no *declared* persona claims it here, which includes the
  // personas skipped above. Their accounts are a back door precisely because
  // the environment rule refuses them and the endpoint does not.
  const actors = (await ctx.adapter.findMany({
    model: 'user',
    where: [{ field: 'actor', value: true }],
  })) as ActorUser[]
  const unclaimed = actors.filter((user) => {
    const email = typeof user.email === 'string' ? user.email.toLowerCase() : ''
    return email !== '' && !claimed.has(email)
  })
  result.orphaned = unclaimed.map((user) => String(user.email)).sort()

  if (orphans === 'ban') {
    for (const user of unclaimed) {
      if (user.banned) {
        continue
      }
      await setAuthUserBanned(auth, {
        userId: user.id,
        banned: true,
        reason: `No declared persona claims this actor account in '${environment ?? 'an unresolved environment'}'`,
      })
      result.banned++
    }
  }

  logger.info(
    `personas: ${result.created} account(s) created, ${result.granted} role grant(s) applied, ${result.held} already held` +
      (result.skipped.length
        ? `, ${result.skipped.length} persona(s) skipped — they do not act in '${environment ?? 'an unresolved environment'}'`
        : '') +
      (result.unbanned ? `, ${result.unbanned} ban(s) lifted` : '')
  )
  for (const skipped of result.skipped) {
    logger.info(`  ${skipped}`)
  }

  if (result.orphaned.length) {
    const banned = orphans === 'ban'
    logger.warn(
      `personas: ${result.orphaned.length} actor account(s) no declared persona claims here` +
        (banned
          ? `, ${result.banned} newly banned`
          : ' — they keep every role they were granted, and the actor endpoint authenticates on the actor column alone. Pass orphans: \'ban\' to shut them.')
    )
  }

  return result
}
