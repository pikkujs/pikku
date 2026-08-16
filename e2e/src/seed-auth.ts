import type { CoreSingletonServices } from '@pikku/core/types'
import {
  ADMIN_USER,
  GUEST_USER,
  STAFF_USER,
  TARGET_USER,
  type SeedUser,
} from './auth-fixtures.js'
import { personaConfigs } from '#pikku/scenarios/pikku-personas.gen.js'

const signUp = async (baseUrl: string, user: SeedUser) => {
  const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify(user),
  })
  if (!res.ok && res.status !== 422) {
    throw new Error(`seed sign-up failed for ${user.email}: ${res.status}`)
  }
}

export const seedAuthUsers = async (
  services: CoreSingletonServices,
  baseUrl: string
) => {
  await signUp(baseUrl, ADMIN_USER)
  await signUp(baseUrl, GUEST_USER)
  await signUp(baseUrl, STAFF_USER)
  await signUp(baseUrl, TARGET_USER)
  services.logger.info(
    `seeded console users: ${ADMIN_USER.email}, ${STAFF_USER.email}, ${GUEST_USER.email}, ${TARGET_USER.email} (admin grants follow in seedScopes)`
  )
}

/**
 * Signs every declared scenario actor in once, through the actor plugin's own
 * endpoint, so its `actor: true` user row exists before seedScopes runs. Actor
 * rows are otherwise created lazily on first sign-in, which is too late for a
 * scope grant keyed by email.
 */
export const seedScenarioActors = async (
  services: CoreSingletonServices,
  baseUrl: string
) => {
  const secret = await services.variables.get('SCENARIO_ACTOR_SECRET')
  if (!secret) {
    services.logger.info(
      'SCENARIO_ACTOR_SECRET is unset — skipping scenario actor seeding'
    )
    return
  }
  for (const [name, actor] of Object.entries(personaConfigs)) {
    const res = await fetch(`${baseUrl}/api/auth/sign-in/actor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ email: actor.email, name: actor.name, secret }),
    })
    if (!res.ok) {
      throw new Error(
        `seed actor sign-in failed for ${name} (${actor.email}): ${res.status}`
      )
    }
  }
  services.logger.info(
    `seeded scenario actors: ${Object.values(personaConfigs)
      .map((a) => a.email)
      .join(', ')}`
  )
}
