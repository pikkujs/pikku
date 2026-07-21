// Seeded console users, shared by src/seed-auth.ts, src/seed-scopes.ts (which
// grants the admin scopes) and the @console tests.
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

/**
 * A console admin (granted the umbrella `admin` scope directly, so the console
 * AuthGate lets them in) who holds NO scope role — so the self-hosting scope
 * RPCs, which additionally require `pikku:scopes:read`, refuse them with a 403.
 * Exists to exercise the "you don't have permission" state, distinct from a
 * real outage.
 */
export const STAFF_USER: SeedUser = {
  name: 'E2E Staff',
  email: 'staff@e2e.test',
  password: 'staff-password',
}
