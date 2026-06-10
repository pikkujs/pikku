import { createHash } from 'crypto'

export interface AuthUser {
  id: string
  email: string
  passwordHash: string
}

const store = new Map<string, AuthUser>()

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

export function createUser(email: string, password: string): AuthUser {
  const existing = store.get(email.toLowerCase())
  if (existing) {
    throw new Error(`User ${email} already exists`)
  }
  const user: AuthUser = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    email: email.toLowerCase(),
    passwordHash: hashPassword(password),
  }
  store.set(user.email, user)
  return user
}

export function lookupUser(email: string, password: string): AuthUser | null {
  const user = store.get(email.toLowerCase())
  if (!user) return null
  if (user.passwordHash !== hashPassword(password)) return null
  return user
}

export function findUserByEmail(email: string): AuthUser | undefined {
  return store.get(email.toLowerCase())
}

export function resetUserStore(): void {
  store.clear()
}
