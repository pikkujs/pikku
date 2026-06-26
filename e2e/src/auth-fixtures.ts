// Seeded console users, shared by src/seed-auth.ts and the @console tests.
export interface SeedUser {
  name: string
  email: string
  password: string
}

export const ADMIN_USER: SeedUser = {
  name: 'E2E Admin',
  email: 'admin@e2e.test',
  password: 'admin-password',
}

export const GUEST_USER: SeedUser = {
  name: 'E2E Guest',
  email: 'guest@e2e.test',
  password: 'guest-password',
}
