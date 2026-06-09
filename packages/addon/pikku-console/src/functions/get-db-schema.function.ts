import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'
import type { DbSchema } from '../services/db-schema.service.js'

export const getDbSchema = pikkuSessionlessFunc<null, DbSchema | null>({
  title: 'Get Database Schema',
  description:
    'Introspects the local development SQLite database and returns table/column metadata enriched with data-classification annotations from db/annotations.gen.json.',
  expose: true,
  auth: false,
  func: async ({ dbSchemaService }) => {
    if (!dbSchemaService) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    return dbSchemaService.getSchema()
  },
})
