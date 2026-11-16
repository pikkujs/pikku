/**
 * The better-auth options both apps use, minus `database` (each app hands over its own Kysely, opened on the same file).
 * Same secret, same cookie settings, no rate limiting, no logging. `cookieCache` stays off on purpose: every request must
 * read the session row from the database. `permissions` is a column on the user row, returned with the session.
 */
export const authOptions = (secret: string) => ({
  secret,
  baseURL: 'http://127.0.0.1',
  trustedOrigins: ['http://127.0.0.1'],
  emailAndPassword: { enabled: true },
  rateLimit: { enabled: false },
  logger: { disabled: true },
  user: {
    additionalFields: {
      permissions: {
        type: 'string' as const,
        required: false,
        defaultValue: '',
        input: false,
      },
    },
  },
})

export const SESSION_COOKIE = 'better-auth.session_token'
export const hasPermission = (permissions: unknown, needed: string) =>
  typeof permissions === 'string' && permissions.split(',').includes(needed)
