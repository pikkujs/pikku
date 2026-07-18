import type { CoreSingletonServices } from '@pikku/core'
import {
  ADMIN_USER,
  GUEST_USER,
  STAFF_USER,
  type SeedUser,
} from './auth-fixtures.js'

type SeedServices = CoreSingletonServices & { kysely?: any }

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
  services: SeedServices,
  baseUrl: string
) => {
  await signUp(baseUrl, ADMIN_USER)
  await signUp(baseUrl, GUEST_USER)
  await signUp(baseUrl, STAFF_USER)
  await (services.kysely as any)
    .updateTable('user')
    .set({ role: 'admin' })
    .where('email', 'in', [ADMIN_USER.email, STAFF_USER.email])
    .execute()
  services.logger.info(
    `seeded console users: ${ADMIN_USER.email} (admin), ${STAFF_USER.email} (admin, no scopes), ${GUEST_USER.email}`
  )
}
