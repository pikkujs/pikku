import type { CoreSingletonServices } from '@pikku/core/types'
import { VIRTUAL_USER_IN_PROCESS_ENDPOINT } from '@pikku/core/services'
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
 * Signs every declared scenario virtual user in once, in-process through the auth
 * service, so its `virtualUser: true` user row exists before seedScopes runs. Virtual user
 * rows are otherwise created lazily on first sign-in, which is too late for a
 * scope grant keyed by email.
 */
export const seedScenarioVirtualUsers = async (
  services: CoreSingletonServices
) => {
  const signIn = (await services.auth?.())?.api[
    VIRTUAL_USER_IN_PROCESS_ENDPOINT
  ]
  if (typeof signIn !== 'function') {
    services.logger.info(
      'virtual user sign-in is not open — skipping scenario virtual user seeding'
    )
    return
  }
  for (const [name, virtualUser] of Object.entries(virtualUserConfigs)) {
    const res: Response = await signIn({
      body: { email: virtualUser.email, name: virtualUser.name },
      asResponse: true,
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
