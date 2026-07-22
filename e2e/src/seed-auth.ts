import type { CoreSingletonServices } from '@pikku/core'
import {
  ADMIN_USER,
  GUEST_USER,
  STAFF_USER,
  TARGET_USER,
  type SeedUser,
} from './auth-fixtures.js'

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
