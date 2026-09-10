import { dirname, relative } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeAnalytics } from './serialize-analytics.js'
import { analyticsSchemasFile } from '../../../utils/analytics-schemas-file.js'
import { isDeployCodegen } from '../../../utils/is-deploy-codegen.js'

/**
 * ESM specifier from the generated ingest to the app's `pikkuAnalytics`
 * declaration.
 *
 * Relative rather than aliased: the declaration is ordinary project source that
 * a consumer may put anywhere, and a `#pikku` leaf would imply pikku generated
 * it. Emitted with a `.js` extension and a leading `./` so the specifier is
 * valid ESM rather than a bare module id.
 */
export const analyticsSpecifier = (
  analyticsFile: string,
  declarationFile: string
): string => {
  const rel = relative(dirname(analyticsFile), declarationFile)
    .replace(/\.tsx?$/, '.js')
    .split(/[\\/]/)
    .join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

export const pikkuAnalytics = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables, getInspectorState }) => {
    if (await isDeployCodegen(variables)) {
      return false
    }

    if (!config.scaffold?.analytics || !config.analyticsFile) {
      return false
    }

    const { analytics } = await getInspectorState()

    // Refuse rather than emit an ingest that imports a declaration which is not
    // there: the generated wire would fail to typecheck, pointing at generated
    // code instead of at the one thing the project actually has to supply.
    if (!analytics) {
      logger.error(
        `scaffold.analytics is enabled but no pikkuAnalytics declaration was found. ` +
          `Add one in a source directory: \`export const analytics = pikkuAnalytics({ events, sink })\`.`
      )
      return false
    }

    const leaf = (name: string) =>
      getLeafImportPath(config.analyticsFile!, name, config)
    const { schemas, functions } = serializeAnalytics(
      leaf,
      analyticsSpecifier(config.analyticsFile, analytics.file),
      analytics.variable,
      config.globalHTTPPrefix || ''
    )
    await writeFileInDir(
      logger,
      analyticsSchemasFile(config.analyticsFile)!,
      schemas
    )
    await writeFileInDir(logger, config.analyticsFile, functions)
    await removeLegacyScaffoldFile(config.analyticsFile)
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating Analytics Ingest',
      commandEnd: 'Generated Analytics Ingest',
    }),
  ],
})
