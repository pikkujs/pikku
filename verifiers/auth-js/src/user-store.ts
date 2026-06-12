import { createHash } from 'node:crypto'

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
  const key = email.toLowerCase()
  if (store.has(key)) throw new Error(`User ${email} already exists`)
  const user: AuthUser = {
    id: `user-${email}`,
    email: key,
    passwordHash: hashPassword(password),
  }
  store.set(key, user)
  return user
}

export function lookupUser(email: string, password: string): AuthUser | null {
  const user = store.get(email.toLowerCase())
  if (!user || user.passwordHash !== hashPassword(password)) return null
  return user
}

export function resetStore(): void {
  store.clear()
}
