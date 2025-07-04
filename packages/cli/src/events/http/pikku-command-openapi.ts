import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { generateSchemas } from '../../schema-generator.js'
import { generateOpenAPISpec } from './openapi-spec-generator.js'
import { stringify } from 'yaml'
import { PikkuCommand } from '../../types.js'

export const pikkuOpenAPI: PikkuCommand = async (
  logger,
  { tsconfig, openAPI },
  { http, functions }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating OpenAPI spec',
    'Created OpenAPI spec',
    [openAPI?.outputFile === undefined, 'openAPI outfile is not defined'],
    async () => {
      if (!openAPI?.outputFile) {
        throw new Error('openAPI is required')
      }
      const schemas = await generateSchemas(
        logger,
        tsconfig,
        functions.typesMap,
        functions.meta,
        http.meta
      )
      const openAPISpec = await generateOpenAPISpec(
        functions.meta,
        http.meta,
        schemas,
        openAPI.additionalInfo
      )
      if (openAPI.outputFile.endsWith('.json')) {
        await writeFileInDir(
          logger,
          openAPI.outputFile,
          JSON.stringify(openAPISpec, null, 2),
          { ignoreModifyComment: true }
        )
      } else if (
        openAPI.outputFile.endsWith('.yaml') ||
        openAPI.outputFile.endsWith('.yml')
      ) {
        await writeFileInDir(
          logger,
          openAPI.outputFile,
          stringify(openAPISpec),
          { ignoreModifyComment: true }
        )
      }
    }
  )
}
