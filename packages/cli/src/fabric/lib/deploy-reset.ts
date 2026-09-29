import { FabricPreconditionError } from './errors.js'

/**
 * `pikku fabric deploy apply --reset` — wipe the target stage's database and
 * rebuild it from the current migrations and the dev seed, as part of the
 * deploy. It is the deployed counterpart of `pikku db reset`, and inherits the
 * same rule: dev only. A stage that is not production and is meant to be thrown
 * away (an app's `develop` branch) is the only thing it is for.
 */

/** Production is always `main`, so `main` is refused however it was named. */
const PRODUCTION_BRANCH = 'main'

/**
 * Refuse every target `--reset` must never touch. Runs on the input alone (no
 * network, no git) and again once the target branch is known, so a branch that
 * was inferred from the checkout is held to the same rule as one that was typed.
 */
export const assertResetAllowed = (target: {
  production?: boolean
  deploymentId?: string
  branch?: string
}): void => {
  if (target.production || target.branch === PRODUCTION_BRANCH) {
    throw new FabricPreconditionError(
      '--reset refused: it wipes the stage database, and production (main) is never reset. Use it on a disposable stage such as `develop`.'
    )
  }
  if (target.deploymentId) {
    throw new FabricPreconditionError(
      '--reset applies to a deploy it creates, not to attaching to deployment ' +
        `${target.deploymentId} — drop --deployment-id, or drop --reset.`
    )
  }
}

/** What the reset will do, in the words the confirmation and `-y` both print. */
export const resetWarning = (target: {
  app: string
  branch: string
}): string[] => [
  `--reset will WIPE ALL DATA in the database of stage "${target.branch}" of app "${target.app}".`,
  'It then re-applies every migration and the dev seed (db/<engine>-dev-seed.sql) as part of this deploy.',
  'This cannot be undone.',
]

export const resetPrompt = (target: {
  app: string
  branch: string
  ref: string
}): string =>
  `Deploy ${target.branch} @ ${target.ref} of "${target.app}" and WIPE ALL DATA in its database, then re-migrate and re-seed?`

/**
 * The deploy request only carries `resetDatabase`; a fabric server that does
 * not know the field drops it and deploys normally, which would leave the caller
 * believing a wipe happened. So the server has to echo `resetDatabase: true`
 * back on the created deployment, and anything less is treated as unsupported.
 */
export const assertResetHonoured = (
  created: { deploymentId: string; resetDatabase?: boolean },
  apiUrl: string
): void => {
  if (created.resetDatabase === true) return
  throw new FabricPreconditionError(
    `--reset is not supported by ${apiUrl}: the deployment ${created.deploymentId} was created WITHOUT a database reset, and has not been approved by this command. ` +
      'Update the fabric server, or drop --reset. Deployment left as-is (nothing was wiped).'
  )
}
