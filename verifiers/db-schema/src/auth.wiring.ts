import { betterAuth } from 'better-auth'
import { admin, organization, twoFactor } from 'better-auth/plugins'
import { pikkuBetterAuth } from '#pikku'

/**
 * Better Auth with plugins that change the schema, which is the point.
 *
 * A four-table core is easy to hardcode and would pass a test that only ever
 * saw one. `organization()` adds three tables of its own, `twoFactor()` a
 * fourth, and `admin()` adds columns to `user` and `session` rather than tables
 * — so a generator that special-cases table creation but not column addition
 * fails here. The auth source has to be the schema Better Auth materializes.
 *
 * Nothing runs migrations at boot. `pikku db generate` writes them down and
 * `pikku db migrate` applies them; that is the behaviour under test.
 */
export const auth = pikkuBetterAuth(async ({ secrets, kysely }) =>
  betterAuth({
    secret: await secrets.getSecret('BETTER_AUTH_SECRET'),
    baseURL: 'http://localhost',
    database: { db: kysely, type: 'sqlite' },
    emailAndPassword: { enabled: true },
    plugins: [organization(), admin(), twoFactor()],
  })
)
