import { writeFileSync, rmSync } from 'node:fs'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { openDb } from './db.js'
import { authOptions, SESSION_COOKIE } from './auth-options.js'
import { ITEM_ROWS } from './routes.js'

export const BENCH_SECRET = 'bench-secret-bench-secret-bench-secret-32'
export const USERS = {
  allowed: { email: 'allowed@bench.local', permissions: 'p0,p1,p2,p3' },
  denied: { email: 'denied@bench.local', permissions: 'p9' },
}
const PASSWORD = 'bench-password-1234'

/**
 * Setup, outside every measured window: create the pristine database (better-auth's own migrations, the items table, one user who
 * holds the permissions and one who does not), sign both in ONCE through better-auth, and save their session cookies.
 * Password hashing happens here and never again.
 */
export const seed = async (dbFile: string, cookieFile: string) => {
  rmSync(dbFile, { force: true })
  const db = openDb(dbFile)
  const auth = betterAuth({
    ...authOptions(BENCH_SECRET),
    database: { db, type: 'sqlite' },
  })
  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
  await db.schema
    .createTable('items')
    .addColumn('id', 'integer', (c) => c.primaryKey())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('value', 'integer', (c) => c.notNull())
    .execute()
  await db
    .insertInto('items')
    .values(
      Array.from({ length: ITEM_ROWS }, (_, i) => ({
        id: i + 1,
        name: `item-${i + 1}`,
        value: (i * 7919) % 10007,
      }))
    )
    .execute()
  const cookies: Record<string, string> = {}
  for (const [key, user] of Object.entries(USERS)) {
    await auth.api.signUpEmail({
      body: { email: user.email, password: PASSWORD, name: key },
    })
    await db
      .updateTable('user')
      .set({ permissions: user.permissions })
      .where('email', '=', user.email)
      .execute()
    const res = await auth.api.signInEmail({
      body: { email: user.email, password: PASSWORD },
      asResponse: true,
    })
    const setCookie = res.headers.getSetCookie().join('\n')
    const match = setCookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
    if (!match) throw new Error(`no session cookie for ${key}: ${setCookie}`)
    cookies[key] = `${SESSION_COOKIE}=${match[1]}`
  }
  await db.destroy()
  writeFileSync(cookieFile, JSON.stringify(cookies, null, 2))
}
