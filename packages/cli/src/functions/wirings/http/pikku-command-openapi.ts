import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { generateSchemas } from '../../../utils/schema-generator.js'
import { generateOpenAPISpec } from './openapi-spec-generator.js'
import { stringify } from 'yaml'

export const pikkuOpenAPI: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { http, functions } = await getInspectorState()
    const { tsconfig, openAPI, schemasFromTypes } = config

    if (!openAPI?.outputFile) {
      throw new Error('openAPI is required')
    }

    const schemas = await generateSchemas(
      logger,
      tsconfig,
      functions.typesMap,
      functions.meta,
      http.meta,
      schemasFromTypes
    )
    const openAPISpec = await generateOpenAPISpec(
      logger,
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
      await writeFileInDir(logger, openAPI.outputFile, stringify(openAPISpec), {
        ignoreModifyComment: true,
      })
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating OpenAPI spec',
      commandEnd: 'Created OpenAPI spec',
      skipCondition: ({ config }) => config.openAPI?.outputFile === undefined,
      skipMessage: 'openAPI outfile is not defined',
    }),
  ],
})
