import type { CoreSingletonServices } from '@pikku/core/types'
import { deriveVirtualUserSecret } from '@pikku/core/services'
import {
  ADMIN_USER,
  GUEST_USER,
  STAFF_USER,
  TARGET_USER,
  type SeedUser,
} from './auth-fixtures.js'
import { virtualUserConfigs } from '#pikku/scenarios/pikku-virtual-users.gen.js'

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
 * Signs every declared scenario virtual user in once, through the virtual user plugin's own
 * endpoint, so its `virtualUser: true` user row exists before seedScopes runs. Virtual user
 * rows are otherwise created lazily on first sign-in, which is too late for a
 * scope grant keyed by email.
 */
export const seedScenarioVirtualUsers = async (
  services: CoreSingletonServices,
  baseUrl: string
) => {
  const secret = await services.variables.get('SCENARIO_VIRTUAL_USER_SECRET')
  if (!secret) {
    services.logger.info(
      'SCENARIO_VIRTUAL_USER_SECRET is unset — skipping scenario virtual user seeding'
    )
    return
  }
  for (const [name, virtualUser] of Object.entries(virtualUserConfigs)) {
    const res = await fetch(`${baseUrl}/api/auth/sign-in/virtual-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({
        email: virtualUser.email,
        name: virtualUser.name,
        secret: await deriveVirtualUserSecret(
          String(secret),
          virtualUser.email
        ),
      }),
    })
    if (!res.ok) {
      throw new Error(
        `seed virtual user sign-in failed for ${name} (${virtualUser.email}): ${res.status}`
      )
    }
  }
  services.logger.info(
    `seeded scenario virtual users: ${Object.values(virtualUserConfigs)
      .map((a) => a.email)
      .join(', ')}`
  )
}
