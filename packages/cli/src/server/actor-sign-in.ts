/**
 * Which of the two server commands is allowed to turn actor sign-in on.
 *
 * `pikku dev` is not production by definition, so it enables the passwordless
 * "sign in as <persona>" endpoint itself and mints the secret it needs. Making
 * every contributor hand-manage a `SCENARIO_ACTOR_SECRET` for a local dev server
 * buys nothing — the process is already trusted with the database — while
 * costing setup friction on every machine and, when it is skipped, a dev
 * switcher that renders nothing for no stated reason.
 *
 * `pikku serve` is the production server command and gets the opposite
 * treatment: it clears the marker, so an environment that carries one — an image
 * built from a dev shell, a copied `.env`, a process manager passing its whole
 * environment through — cannot switch passwordless sign-in on behind the
 * operator. What it deliberately does *not* touch is `PIKKU_ALLOW_ACTOR_SIGN_IN`:
 * scenario suites have to be able to run against a deployed stage, and that
 * hatch is the supported way to say so.
 */

import { randomBytes } from 'node:crypto'

import {
  ACTOR_SIGN_IN_OPT_IN_ENV,
  DEV_ACTOR_SIGN_IN_ENV,
} from '@pikku/better-auth'
import type { Logger } from '@pikku/core/services'

/** The name the server side reads the actor secret under. */
export const ACTOR_SECRET_ENV = 'SCENARIO_ACTOR_SECRET'

/**
 * The same value under the name a Vite dev frontend can actually see — only
 * `VITE_`-prefixed variables reach `import.meta.env`, and the dev switcher runs
 * in the browser. Both are set so a frontend started from this environment picks
 * the secret up without a second declaration.
 */
export const VITE_ACTOR_SECRET_ENV = 'VITE_SCENARIO_ACTOR_SECRET'

/** 32 bytes, base64url — long enough that the constant-time compare is the only way in. */
const mintEphemeralSecret = (): string => randomBytes(32).toString('base64url')

/**
 * Called by `pikku dev` before the project is loaded, so the marker and the
 * secret are already in place by the time `actor()` is constructed.
 *
 * An explicitly-set secret always wins over the minted one: a project that
 * points its scenario runs and its dev server at the same value has to keep that
 * value, and silently replacing it would break the runs it was set for. The
 * minted one is per-run and lives only in this process's environment — nothing
 * writes it to disk, so yesterday's secret cannot sign anything in today.
 */
export const enableDevActorSignIn = (logger: Logger): void => {
  process.env[DEV_ACTOR_SIGN_IN_ENV] = 'true'

  const configured = process.env[ACTOR_SECRET_ENV] || undefined
  const configuredForFrontend = process.env[VITE_ACTOR_SECRET_ENV] || undefined

  // Two names for one value, so a disagreement between them is a bug that
  // presents as "the switcher signs in nowhere" — worth naming rather than
  // resolving in silence.
  if (
    configured &&
    configuredForFrontend &&
    configured !== configuredForFrontend
  ) {
    logger.warn(
      `${ACTOR_SECRET_ENV} and ${VITE_ACTOR_SECRET_ENV} are set to different values — using ${ACTOR_SECRET_ENV}, since that is the one the server compares against`
    )
  }

  const secret = configured ?? configuredForFrontend ?? mintEphemeralSecret()
  process.env[ACTOR_SECRET_ENV] = secret
  process.env[VITE_ACTOR_SECRET_ENV] = secret

  logger.info(
    (configured ?? configuredForFrontend)
      ? `Actor quick login enabled, using the ${configured ? ACTOR_SECRET_ENV : VITE_ACTOR_SECRET_ENV} already in this environment`
      : 'Actor quick login enabled with a secret minted for this run — nothing to configure, and it is gone when the server stops'
  )
}

/**
 * Called by `pikku serve` before the project is loaded, for the same reason in
 * reverse: whatever the environment claims, this command is the one that gets
 * deployed, so the dev marker never survives into it.
 */
export const disableDevActorSignIn = (logger: Logger): void => {
  if (process.env[DEV_ACTOR_SIGN_IN_ENV] !== undefined) {
    logger.warn(
      `${DEV_ACTOR_SIGN_IN_ENV} was set in this environment and has been cleared — \`pikku serve\` never enables actor sign-in. Set ${ACTOR_SIGN_IN_OPT_IN_ENV} if this stage is meant to run scenarios.`
    )
  }
  delete process.env[DEV_ACTOR_SIGN_IN_ENV]
}
