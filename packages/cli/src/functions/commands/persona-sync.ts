import { pikkuSessionlessFunc } from '#pikku/function'
import type { ResolvedPersona } from '@pikku/core/services'
import { personaEnvironmentRefusal } from '@pikku/core/persona'

import { resolvePersonas } from '../../utils/resolve-personas.js'

/**
 * Report which personas an environment will provision, and which it will not.
 *
 * It reports rather than writes, because the writing happens somewhere this
 * command cannot reach. Provisioning a persona means creating a user row and
 * granting it roles, and both of those live in the deployment's database — one
 * the CLI has no connection to for any environment that is not the developer's
 * own. This command used to open a Kysely connection from the local project
 * config and write through it, which provisioned a local stage correctly and
 * silently provisioned the wrong database for every other environment.
 *
 * So the deployment provisions itself: an app calls `provisionPersonas` from
 * `@pikku/better-auth` in its server lifecycle, where the database connection
 * and better-auth's own adapter are both already open, and a deploy carries its
 * personas with it. What is left here is the half that needs no database — the
 * declaration, and the environment rule applied to it — which is what tells you
 * before a deploy whether the accounts you expect will appear.
 */
export const personaSync = pikkuSessionlessFunc<
  {
    environment: string
  },
  void
>({
  func: async ({ logger, config, getInspectorState }, { environment }) => {
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
    if (!environments[environment]) {
      throw new Error(
        `Unknown environment '${environment}'. Configured environments: ${
          Object.keys(environments).join(', ') || 'none'
        }.`
      )
    }

    // The same rule that decides who may *run* against an environment decides
    // who is provisioned into it. Two rules would drift, and the one that
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
      for (const refusal of skipped) {
        logger.info(`  ${refusal}`)
      }
      logger.info(
        '  Give the persona this environment, and disposition `accountable` if it is production.'
      )
      return
    }

    logger.info(
      `persona sync: ${eligible.length} persona(s) will be provisioned when a deployment of '${environment}' starts:`
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
    logger.info(
      "  Provisioning runs in the deployment: call `provisionPersonas` from '@pikku/better-auth' in your server lifecycle, passing `personaConfigs` and `personaEnvironments` from the generated personas file."
    )
  },
})
