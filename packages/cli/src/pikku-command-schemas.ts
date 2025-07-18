import { generateSchemas, saveSchemas } from './schema-generator.js'
import { logCommandInfoAndTime } from './utils.js'
import { PikkuCommand } from './types.js'

export const pikkuSchemas: PikkuCommand = async (
  logger,
  { tsconfig, schemaDirectory, supportsImportAttributes },
  { functions, http }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating schemas',
    'Created schemas',
    [false],
    async () => {
      const schemas = await generateSchemas(
        logger,
        tsconfig,
        functions.typesMap,
        functions.meta,
        http.meta
      )
      await saveSchemas(
        logger,
        schemaDirectory,
        schemas,
        functions.typesMap,
        functions.meta,
        supportsImportAttributes
      )
    }
  )
}
