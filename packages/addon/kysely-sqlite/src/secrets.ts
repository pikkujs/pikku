import { defineSecret } from '#pikku/addon/secrets'
import { z } from 'zod'

export const LibsqlUrlSchema = z.string().min(1)
export const LibsqlTokenSchema = z.string().min(1)

defineSecret({
  name: 'libsqlUrl',
  displayName: 'libSQL database URL',
  description:
    'The libSQL (Turso) database the kysely service talks to over HTTP',
  secretId: 'LIBSQL_URL',
  schema: LibsqlUrlSchema,
})

defineSecret({
  name: 'libsqlAuthToken',
  displayName: 'libSQL auth token',
  description: 'The token the libSQL database accepts',
  secretId: 'LIBSQL_AUTH_TOKEN',
  schema: LibsqlTokenSchema,
  optional: true,
})
