import { dirname, relative, isAbsolute } from 'node:path'
import { existsSync } from 'node:fs'
import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeAnalytics } from './serialize-analytics.js'
import { isDeployCodegen } from '../../../utils/is-deploy-codegen.js'

/**
 * ESM specifier from the generated ingest to the app's event union.
 *
 * Relative rather than aliased: the union is ordinary project source that a
 * consumer may put anywhere, and a `#pikku` leaf would imply pikku generated
 * it. Emitted with a `.js` extension and a leading `./` so the specifier is
 * valid ESM rather than a bare module id.
 */
export const analyticsEventsSpecifier = (
  analyticsFile: string,
  analyticsEventsFile: string
): string => {
  const rel = relative(dirname(analyticsFile), analyticsEventsFile)
    .replace(/\.tsx?$/, '.js')
    .split(/[\\/]/)
    .join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

export const pikkuAnalytics = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    if (await isDeployCodegen(variables)) {
      return false
    }

    if (
      !config.scaffold?.analytics ||
      !config.analyticsFile ||
      !config.analyticsSchemasFile ||
      !config.analyticsEventsFile
    ) {
      return false
    }

    const eventsFile = isAbsolute(config.analyticsEventsFile)
      ? config.analyticsEventsFile
      : `${config.rootDir}/${config.analyticsEventsFile}`

    // Refuse rather than emit an ingest that imports a file which is not there:
    // the generated wire would fail to typecheck, pointing at generated code
    // instead of at the one thing the project actually has to supply.
    if (!existsSync(eventsFile)) {
      logger.error(
        `scaffold.analytics is enabled but no event union was found at ${eventsFile}. ` +
          `Create it exporting \`analyticsEvent\` (a zod discriminated union on \`name\`), ` +
          `or point \`analyticsEventsFile\` at it.`
      )
      return false
    }

    const leaf = (name: string) =>
      getLeafImportPath(config.analyticsFile!, name, config)
    const { schemas, functions } = serializeAnalytics(
      leaf,
      analyticsEventsSpecifier(config.analyticsFile, eventsFile),
      config.globalHTTPPrefix || ''
    )
    await writeFileInDir(logger, config.analyticsSchemasFile, schemas)
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
