import { z } from 'zod'
import {
  ACTOR_SIGN_IN_OPT_IN_ENV,
  devSwitcherOn,
  listDevActors as signInablePersonas,
} from '@pikku/better-auth'
import { pikkuSessionlessFunc } from '#pikku/function'
import { personaList } from '#pikku/scenarios/pikku-personas.gen.js'

export const ListDevActorsInput = z.object({ app: z.string().optional() })

export const ListDevActorsOutput = z.object({
  actors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      jobTitle: z.string().nullable(),
    })
  ),
})

/**
 * The personas the "Sign in as …" switcher offers — none wherever the switcher
 * is off, so a production deployment lists nobody. Sessionless because its
 * whole audience is somebody not yet signed in.
 */
export const listDevActors = pikkuSessionlessFunc({
  expose: true,
  readonly: true,
  description: 'The personas the dev "Sign in as" switcher offers.',
  input: ListDevActorsInput,
  output: ListDevActorsOutput,
  func: async ({ variables, featureFlags }, { app }) => {
    const optIn = await variables.get(ACTOR_SIGN_IN_OPT_IN_ENV)
    if (!(await devSwitcherOn(featureFlags, optIn))) return { actors: [] }
    return { actors: signInablePersonas(personaList, app) }
  },
})
