import { defineSecret } from '#pikku/addon/secrets'
import { z } from 'zod'

export const MysqlUrlSchema = z.string().min(1)

defineSecret({
  name: 'mysqlUrl',
  displayName: 'MySQL connection string',
  description: 'The database the kysely service connects to',
  secretId: 'DATABASE_URL',
  schema: MysqlUrlSchema,
})
