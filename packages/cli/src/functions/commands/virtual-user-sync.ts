import { pikkuSessionlessFunc } from '#pikku/function'
import type { ResolvedVirtualUser } from '@pikku/core/services'
import { virtualUserEnvironmentRefusal } from '@pikku/core/virtual-user'

import { resolveVirtualUsers } from '../../utils/resolve-virtual-users.js'

/**
 * Report which virtual users an environment will provision, and which it will not.
 *
 * It reports rather than writes, because the writing happens somewhere this
 * command cannot reach. Provisioning a virtual user means creating a user row and
 * granting it roles, and both of those live in the deployment's database — one
 * the CLI has no connection to for any environment that is not the developer's
 * own. This command used to open a Kysely connection from the local project
 * config and write through it, which provisioned a local stage correctly and
 * silently provisioned the wrong database for every other environment.
 *
 * So the deployment provisions itself: an app hands its virtual users to
 * `provisionVirtualUsers` from `@pikku/better-auth`, called from the route that
 * resolves the address a caller wants to act as, where the database connection
 * and better-auth's own adapter are both already open. What is left here is the
 * half that needs no database — the
 * declaration, and the environment rule applied to it — which is what tells you
 * before a deploy whether the accounts you expect will appear.
 */
export const virtualUserSync = pikkuSessionlessFunc<
  {
    environment: string
  },
  void
>({
  func: async ({ logger, config, getInspectorState }, { environment }) => {
    const state = await getInspectorState(true, false, false, true)
    const virtualUsers = resolveVirtualUsers(
      state.virtualUsers?.definitions ?? [],
      config.scenarios?.emailDomain
    )
    if (Object.keys(virtualUsers).length === 0) {
      logger.info(
        'virtual-user sync: no virtual users are declared — add a defineVirtualUsers({ … }) call.'
      )
      return
    }

    const environments = config.environments ?? {}
    if (!environments[environment]) {
      throw new Error(
        `Unknown environment '${environment}'. Configured environments: ${
          Object.keys(environments).join(', ') || 'none'
        }.`
      )
    }

    // The same rule that decides who may *run* against an environment decides
    // who is provisioned into it. Two rules would drift, and the one that
    // drifted would leave an account standing in production for a virtual user the
    // engine then refuses to sign in.
    //
    // A `runnable: false` virtual user is still provisioned: their account is the
    // whole reason they were declared, because other people act on it.
    const eligible: Array<[string, ResolvedVirtualUser]> = []
    const skipped: string[] = []
    for (const [id, virtualUser] of Object.entries(virtualUsers)) {
      const refusal = virtualUserEnvironmentRefusal(
        id,
        virtualUser,
        environment,
        environments
      )
      if (refusal) {
        skipped.push(refusal)
        continue
      }
      eligible.push([id, virtualUser])
    }

    if (eligible.length === 0) {
      logger.info(
        `virtual-user sync: no virtual user may act in '${environment}' — ${skipped.length} declared virtual user(s) were all skipped.`
      )
      for (const refusal of skipped) {
        logger.info(`  ${refusal}`)
      }
      logger.info(
        '  Give the virtual user this environment, and disposition `accountable` if it is production.'
      )
      return
    }

    logger.info(
      `virtual-user sync: ${eligible.length} virtual user(s) will be provisioned when a deployment of '${environment}' starts:`
    )
    for (const [id, virtualUser] of eligible) {
      logger.info(
        `  ${id.padEnd(20)} ${virtualUser.email}${
          virtualUser.roles.length
            ? ` -> ${virtualUser.roles.join(' + ')}`
            : ' (no roles)'
        }`
      )
    }
    for (const refusal of skipped) {
      logger.info(`  skipped: ${refusal}`)
    }
    logger.info(
      "  Provisioning runs in the deployment: call `provisionVirtualUsers({ auth, scopeService, logger }, { virtualUsers: virtualUserConfigs, environments: virtualUserEnvironments })` from '@pikku/better-auth', with both from the generated virtual users file."
    )
  },
})
