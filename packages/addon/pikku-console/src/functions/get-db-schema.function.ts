import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'
import type { DbSchema } from '../services/db-schema.service.js'

export const getDbSchema = pikkuFunc<null, DbSchema | null>({
  title: 'Get Database Schema',
  description:
    'Introspects the local development SQLite database and returns table/column metadata enriched with data-classification annotations from db/annotations.gen.json.',
  expose: true,
  scopes: ['pikku:console:db:read'],
  func: async ({ dbSchemaService }) => {
    if (!dbSchemaService) {
      throw new LocalEnvironmentOnlyError(
        'Only available in local development mode'
      )
    }
    return dbSchemaService.getSchema()
  },
})
