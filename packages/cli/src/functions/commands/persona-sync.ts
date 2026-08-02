import type { Kysely } from 'kysely'

import { pikkuSessionlessFunc } from '#pikku'
import { createHttpPersonas } from '@pikku/core/persona'
import type { ResolvedPersona } from '@pikku/core/services'
import { personaEnvironmentRefusal } from '@pikku/core/persona'

import { resolvePersonas } from '../../utils/resolve-personas.js'
import { resolveEnvironment } from './environment.js'
import { loadDeclaredRoles, openScopeServiceForRoles } from './roles-shared.js'

/**
 * The user id behind a persona's address.
 *
 * Read straight off better-auth's own `user` table rather than through the
 * ScopeService, because the ScopeService has no notion of an address — its
 * grants are keyed by user id, and `pikku_user_role.user_id` already FKs into
 * this exact table. Looking it up anywhere else would mean inventing a second
 * account concept for personas, which is the one thing this command exists to
 * avoid: a persona is a user, provisioned the way users are.
 */
const userIdByEmail = async (
  db: Kysely<any>,
  email: string
): Promise<string | null> => {
  const row = await db
    .selectFrom('user')
    .select('id')
    .where('email', '=', email)
    .executeTakeFirst()
  return row ? String(row.id) : null
}

/**
 * Provision the declared personas into an environment: their accounts, and the
 * roles they declare.
 *
 * This is deployment, not seeding. `pikku db seed` applies a project's test
 * fixtures and does not run in production; an accountable persona doing a real
 * job in production still needs an account and its grants, and this is where
 * they come from.
 *
 * Additive in the same way `syncSystemRoles` is: it creates and grants, and
 * never deletes or revokes. Removing a persona from the code leaves their
 * account and their grants standing until somebody decides otherwise — which is
 * the point, because the alternative is a rolling deploy quietly locking out the
 * teammate that the older replica is still running.
 *
 * It needs both halves of an environment: its API, to sign the persona in, and
 * its database, to write the grants. They must be the same deployment — the
 * command has no way to check that, so pointing it at a stage's API and a local
 * database provisions nobody usefully.
 */
export const personaSync = pikkuSessionlessFunc<
  {
    environment: string
    apiUrl?: string
    dryRun?: boolean
  },
  void
>({
  remote: true,
  func: async (
    { logger, config, getInspectorState, variables },
    { environment, apiUrl, dryRun }
  ) => {
    const state = await getInspectorState(true, false, false, true)
    const personas = resolvePersonas(
      state.personas?.definitions ?? [],
      config.scenarios?.emailDomain
    )
    if (Object.keys(personas).length === 0) {
      logger.info(
        'persona sync: no personas are declared — add a definePersonas({ … }) call.'
      )
      return
    }

    const environments = config.environments ?? {}
    const env = resolveEnvironment({ environment, environments, apiUrl })

    // The same rule that decides who may *run* against an environment decides
    // who may be provisioned into it. Two rules would drift, and the one that
    // drifted would leave an account standing in production for a persona the
    // engine then refuses to sign in.
    //
    // A `runnable: false` persona is still provisioned: their account is the
    // whole reason they were declared, because other people act on it.
    const eligible: Array<[string, ResolvedPersona]> = []
    const skipped: string[] = []
    for (const [id, persona] of Object.entries(personas)) {
      const refusal = personaEnvironmentRefusal(
        id,
        persona,
        environment,
        environments
      )
      if (refusal) {
        skipped.push(refusal)
        continue
      }
      eligible.push([id, persona])
    }

    if (eligible.length === 0) {
      logger.info(
        `persona sync: no persona may act in '${environment}' — ${skipped.length} declared persona(s) were all skipped.`
      )
      logger.info(
        '  Run with --dry-run for the reasons, or give the persona this environment and disposition `accountable` if it is production.'
      )
      return
    }

    if (dryRun) {
      logger.info(
        `persona sync (dry run): ${eligible.length} persona(s) would be provisioned into '${environment}' at ${env.apiUrl}:`
      )
      for (const [id, persona] of eligible) {
        logger.info(
          `  ${id.padEnd(20)} ${persona.email}${
            persona.roles.length
              ? ` -> ${persona.roles.join(' + ')}`
              : ' (no roles)'
          }`
        )
      }
      for (const refusal of skipped) {
        logger.info(`  skipped: ${refusal}`)
      }
      logger.info('Re-run without --dry-run to apply.')
      return
    }

    const secret = await variables.get('SCENARIO_ACTOR_SECRET')
    if (!secret) {
      throw new Error(
        'SCENARIO_ACTOR_SECRET is not set — a persona account cannot be created. ' +
          'Export it in the environment running this command (never put it in pikku.config.json).'
      )
    }

    const declaredRoles = await loadDeclaredRoles(
      config.rolesMetaJsonFile,
      logger
    )
    if (!declaredRoles) {
      throw new Error('role metadata not found')
    }

    const signedIn = createHttpPersonas({
      apiUrl: env.apiUrl,
      secret,
      personas: Object.fromEntries(eligible),
      signInPath: env.signInPath,
      rpcPath: env.rpcPath,
    })

    // Roles are synced on the way in, so a grant can name a role this deploy
    // introduced. Both that sync and everything below are additive.
    const opened = await openScopeServiceForRoles(
      { config, logger },
      declaredRoles,
      'pikku persona sync'
    )
    if (!opened) {
      return
    }

    try {
      let accounts = 0
      let granted = 0
      let held = 0

      for (const [id, persona] of eligible) {
        // Signing in is what creates the account: the actor plugin upserts an
        // `actor: true` user row on first sign-in, and nothing else does.
        // `sessionRoles()` is the public call that forces it — its answer is a
        // by-product here, not the reason for the call.
        await signedIn[id]!.sessionRoles()
        accounts++

        if (persona.roles.length === 0) {
          logger.info(`  ${id.padEnd(20)} ${persona.email} (no roles)`)
          continue
        }

        const userId = await userIdByEmail(opened.db, persona.email)
        if (!userId) {
          throw new Error(
            `persona sync: signed '${id}' in at ${env.apiUrl}, but no user row for ${persona.email} exists in the database this command opened. ` +
              `That database is not the one '${environment}' runs on, so its grants would land nowhere.`
          )
        }

        const already = new Set(await opened.service.listUserRoles(userId))
        const missing = persona.roles.filter((role) => !already.has(role))
        for (const role of missing) {
          await opened.service.addUserToRole(userId, role)
        }
        granted += missing.length
        held += persona.roles.length - missing.length

        logger.info(
          `  ${id.padEnd(20)} ${persona.email} -> ${persona.roles.join(' + ')}${
            missing.length === 0 ? ' (already held)' : ''
          }`
        )
      }

      logger.info(
        `persona sync: ${accounts} account(s) in '${environment}', ${granted} role grant(s) applied, ${held} already held`
      )
      if (skipped.length > 0) {
        logger.info(
          `  ${skipped.length} persona(s) skipped — they do not act in '${environment}'. Run with --dry-run for the reasons.`
        )
      }
    } finally {
      await opened.destroy()
    }
  },
})
