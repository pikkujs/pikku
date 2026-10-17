import type {
  Logger,
  ResolvedVirtualUser,
  ScopeService,
} from '@pikku/core/services'
import type { VirtualUserEnvironment } from '@pikku/core/virtual-user'
import {
  appScopeId,
  virtualUserEnvironmentRefusal,
} from '@pikku/core/virtual-user'

import type { AuthGetter } from './admin-users.js'
import type { BetterAuthInstance } from './define-auth.js'
import { setAuthUserBanned } from './admin-users.js'
import { BAN_PLUGIN_ID } from './ban-plugin.js'

/**
 * What provisioning needs off the app's singleton services.
 *
 * A structural subset rather than the app's `SingletonServices`, so this can be
 * called from a lifecycle hook, a scaffolded seed or a test without any of them
 * having to name the same type.
 */
export interface ProvisionVirtualUsersServices {
  auth: (() => Promise<Pick<BetterAuthInstance, '$context'>>) | undefined
  scopeService: Pick<
    ScopeService,
    'addScopeToUser' | 'addUserToRole' | 'listUserRoles' | 'listUserScopes'
  >
  logger: Pick<Logger, 'info' | 'warn'>
}

/**
 * What to do with a virtual user account no declared virtual user claims here.
 *
 * `report` names them and changes nothing, which is the default because a
 * rolling deploy runs the new replica's provisioning while the old replica is
 * still serving: for the length of that overlap, "no virtual user claims this" is
 * a statement about the *newer* declaration only.
 *
 * `ban` shuts sign-in for them, through the same `banned` column the console's
 * ban RPC writes. The row, its grants and its history all survive, so it is
 * reversible — and provisioning lifts the ban again by itself if the virtual user
 * comes back. Deleting the account is deliberately not offered: a virtual user row is
 * referenced by whatever those scenarios did while it existed.
 */
export type VirtualUserOrphanPolicy = 'report' | 'ban'

export interface ProvisionVirtualUsersOptions {
  /** Virtual user id → the declaration with its address filled in — `virtualUserConfigs`. */
  virtualUsers: Record<string, ResolvedVirtualUser>
  /** `environments` from pikku.config.json, as generated beside the virtual users. */
  environments: Readonly<Record<string, VirtualUserEnvironment>>
  /** Which of them this process is. Defaults to `PIKKU_ENV`. */
  environment?: string
  /** What to do with virtual user accounts no declared virtual user claims. Defaults to `report`. */
  orphans?: VirtualUserOrphanPolicy
}

export interface ProvisionVirtualUsersResult {
  created: number
  granted: number
  /** How many `app:<name>` grants were applied for the app a virtual user signs into. */
  appsGranted: number
  held: number
  /** One line per virtual user that may not act here, saying why. */
  skipped: string[]
  /** Addresses of virtual user accounts no declared virtual user claims here. */
  orphaned: string[]
  /** How many of those were banned, which is none unless `orphans: 'ban'`. */
  banned: number
  /** Accounts whose ban was lifted because their virtual user came back. */
  unbanned: number
}

type VirtualUserRow = {
  id: string
  email?: string
  virtualUser?: boolean
  banned?: boolean
} & Record<string, unknown>

/**
 * Provision the declared virtual users into the environment this process is running
 * in: their accounts, and the roles they declare.
 *
 * Runs where the database is, which is the whole point. `pikku virtual-user sync`
 * reached for a Kysely connection built from the local project config, so it
 * only ever provisioned a deployment whose database the developer's machine
 * could open — true of a local stage and of nothing else. A running stage has
 * that connection by definition, so provisioning happens there.
 *
 * Meant to be called by an operator sign-in route on a handshake that names an
 * address the stage has no account for, which is the moment the work is both
 * needed and cheap to detect. The obvious
 * home — `pikkuServerLifecycle`'s `afterStart` — is a trap: that hook is
 * invoked by `pikku serve` and `pikku dev` and by nothing else, so every stage
 * deployed to Workers or a serverless target provisioned nothing at all.
 *
 * Accounts are created through better-auth's internal adapter — the same call
 * the virtual user endpoint makes — rather than by inserting a `user` row directly, so
 * the id shape, the column set and any adapter-level hooks are better-auth's
 * business and not a thing to be reimplemented against its schema.
 *
 * Additive in the same way `syncSystemRoles` is: it creates and grants, never
 * deletes or revokes. Removing a virtual user from the code leaves the account and
 * its grants standing until somebody decides otherwise — the alternative is a
 * rolling deploy quietly locking out a virtual user the older replica is still
 * using.
 *
 * The reverse direction is `orphans`. Provisioning is otherwise additive in the
 * same way `syncSystemRoles` is, which leaves a real hole: an account for a
 * virtual user you deleted keeps its grants, and the virtual user endpoint authenticates on
 * the `virtualUser` column alone without ever consulting the declaration — so an
 * `admin` virtual user nobody declares any more is still a live way in wherever that
 * endpoint is open. `orphans: 'ban'` closes it. See {@link VirtualUserOrphanPolicy}
 * for why that is opt-in rather than the default.
 *
 * A virtual user that may not act in this environment is skipped rather than
 * refused: the same rule that decides who may *run* here decides who is
 * provisioned here, so a production deploy creates the accountable virtual users and
 * leaves the rest uncreated. An address already held by a real (non-virtual-user) user
 * throws, because granting a virtual user's roles to somebody else's account is not
 * a thing to do quietly.
 */
export const provisionVirtualUsers = async (
  {
    auth: contextOnlyAuth,
    scopeService,
    logger,
  }: ProvisionVirtualUsersServices,
  {
    virtualUsers,
    environments,
    environment = typeof process === 'undefined'
      ? undefined
      : process.env.PIKKU_ENV,
    orphans = 'report',
  }: ProvisionVirtualUsersOptions
): Promise<ProvisionVirtualUsersResult> => {
  const result: ProvisionVirtualUsersResult = {
    created: 0,
    granted: 0,
    appsGranted: 0,
    held: 0,
    skipped: [],
    orphaned: [],
    banned: 0,
    unbanned: 0,
  }

  const auth = contextOnlyAuth as AuthGetter
  const entries = Object.entries(virtualUsers)

  // Removing the last virtual user is the one case where there is no work to do and
  // an orphan sweep is exactly the work that was asked for, so only `report`
  // gets to return before the auth context is even resolved.
  if (entries.length === 0 && orphans === 'report') {
    return result
  }

  if (!auth) {
    throw new Error(
      'Provisioning virtual users requires better-auth to be wired (services.auth is missing)'
    )
  }
  const ctx = await (await auth()).$context

  const banAvailable =
    typeof ctx.hasPlugin === 'function'
      ? Boolean(ctx.hasPlugin(BAN_PLUGIN_ID))
      : Boolean(
          ctx.options?.plugins?.some(
            (plugin: any) => plugin?.id === BAN_PLUGIN_ID
          )
        )
  if (orphans === 'ban' && !banAvailable) {
    throw new Error(
      `orphans: 'ban' needs the ban() plugin wired — without it there is no 'banned' column to write. Add it to your auth plugins, or use orphans: 'report'.`
    )
  }

  const claimed = new Set<string>()

  for (const [id, virtualUser] of entries) {
    const refusal = virtualUserEnvironmentRefusal(
      id,
      virtualUser,
      environment,
      environments
    )
    if (refusal) {
      result.skipped.push(refusal)
      continue
    }

    const email = virtualUser.email.toLowerCase()
    claimed.add(email)
    const existing = (await ctx.internalAdapter.findUserByEmail(email))
      ?.user as VirtualUserRow | undefined
    if (existing && !existing.virtualUser) {
      throw new Error(
        `${email} is a real user here, not a virtual user. Refusing to grant virtual user '${id}' the roles of somebody else's account — give the virtual user an address of its own.`
      )
    }

    let user = existing
    if (!user) {
      user = (await ctx.internalAdapter.createUser({
        email,
        name: virtualUser.name,
        emailVerified: true,
        virtualUser: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as VirtualUserRow | undefined
      if (!user) {
        throw new Error(
          `Failed to create a virtual user account for virtual user '${id}'`
        )
      }
      result.created++
    } else if (banAvailable && user.banned) {
      // The virtual user came back. Leaving the ban standing would make a
      // re-declared virtual user permanently unusable, with nothing in the
      // declaration to explain why.
      await setAuthUserBanned(auth, { userId: user.id, banned: false })
      result.unbanned++
    }

    if (virtualUser.app) {
      const scope = appScopeId(virtualUser.app)
      const heldScopes = new Set(await scopeService.listUserScopes(user.id))
      if (heldScopes.has(scope)) {
        result.held++
      } else {
        await scopeService.addScopeToUser(user.id, scope)
        result.appsGranted++
      }
    }

    const roles = virtualUser.roles ?? []
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

  // Every virtual user row, not only the ones this run touched: what makes an account
  // an orphan is that no *declared* virtual user claims it here, which includes the
  // virtual users skipped above. Their accounts are a back door precisely because
  // the environment rule refuses them and the endpoint does not.
  const flaggedUsers = (await ctx.adapter.findMany({
    model: 'user',
    where: [{ field: 'virtualUser', value: true }],
  })) as VirtualUserRow[]
  const unclaimed = flaggedUsers.filter((user) => {
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
        reason: `No declared virtual user claims this virtual user account in '${environment ?? 'an unresolved environment'}'`,
      })
      result.banned++
    }
  }

  logger.info(
    `virtualUsers: ${result.created} account(s) created, ${result.granted} role grant(s) applied` +
      (result.appsGranted
        ? `, ${result.appsGranted} app grant(s) applied`
        : '') +
      `, ${result.held} already held` +
      (result.skipped.length
        ? `, ${result.skipped.length} virtualUser(s) skipped — they do not act in '${environment ?? 'an unresolved environment'}'`
        : '') +
      (result.unbanned ? `, ${result.unbanned} ban(s) lifted` : '')
  )
  for (const skipped of result.skipped) {
    logger.info(`  ${skipped}`)
  }

  if (result.orphaned.length) {
    const banned = orphans === 'ban'
    logger.warn(
      `virtualUsers: ${result.orphaned.length} virtual user account(s) no declared virtual user claims here` +
        (banned
          ? `, ${result.banned} newly banned`
          : " — they keep every role they were granted, and the virtual user endpoint authenticates on the virtual user column alone. Pass orphans: 'ban' to shut them.")
    )
  }

  return result
}
