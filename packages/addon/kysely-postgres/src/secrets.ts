import { defineSecret } from '#pikku/addon/secrets'
import { z } from 'zod'

export const PostgresUrlSchema = z.string().min(1)

defineSecret({
  name: 'postgresUrl',
  displayName: 'Postgres connection string',
  description: 'The database the kysely service connects to',
  secretId: 'DATABASE_URL',
  schema: PostgresUrlSchema,
})
