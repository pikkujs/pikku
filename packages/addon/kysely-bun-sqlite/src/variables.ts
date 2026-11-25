import { defineVariable } from '#pikku/addon/variables'
import { z } from 'zod'

export const BunSqlitePathSchema = z.string().min(1)

defineVariable({
  name: 'sqlitePath',
  displayName: 'SQLite database file',
  description:
    'The file the kysely service opens; ":memory:" keeps it in memory',
  variableId: 'SQLITE_PATH',
  schema: BunSqlitePathSchema,
  optional: true,
})
