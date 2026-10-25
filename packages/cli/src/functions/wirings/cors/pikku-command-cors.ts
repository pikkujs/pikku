import { dirname, relative } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { isDeployCodegen } from '../../../utils/is-deploy-codegen.js'
import {
  analyticsOriginLockEnabled,
  resolveScaffoldFeature,
} from '../../../utils/resolve-scaffold-feature.js'
import {
  AUTO_GENERATED_HEADER,
  resolveCorsDevPort,
  serializeCors,
  serializeCorsOrigins,
} from './serialize-cors.js'

/** ESM specifier from one generated file to a sibling generated file. */
export const siblingSpecifier = (from: string, to: string): string => {
  const rel = relative(dirname(from), to)
    .replace(/\.tsx?$/, '.js')
    .split(/[\\/]/)
    .join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

/** Remove a file only if pikku wrote it, so a hand-written one is never lost. */
const removeIfGenerated = async (file: string | undefined) => {
  if (
    file &&
    existsSync(file) &&
    readFileSync(file, 'utf8').includes(AUTO_GENERATED_HEADER)
  ) {
    await rm(file, { force: true })
  }
}

/**
 * Generates the CORS scaffold: the `CORS_ORIGINS` variable plus the
 * `allowedOrigins` helper (`cors-origins.gen.ts`), and, when `scaffold.cors` is
 * on, the middleware that uses them (`cors.gen.ts`).
 *
 * The variable and helper are also generated when only the analytics origin
 * lock is on, because the lock must enforce the same list CORS advertises. The
 * middleware itself is then left to the project.
 */
export const pikkuCors = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, variables }) => {
    if (await isDeployCodegen(variables)) {
      return false
    }

    const cors = resolveScaffoldFeature('cors', config.scaffold?.cors)
    const needsOrigins =
      cors.enabled || analyticsOriginLockEnabled(config.scaffold)

    if (!needsOrigins || !config.corsOriginsFile) {
      await removeIfGenerated(config.corsOriginsFile)
      await removeIfGenerated(config.corsFile)
      return false
    }

    const port = resolveCorsDevPort(
      cors.options?.port as number | undefined,
      config.frontends
    )
    await writeFileInDir(
      logger,
      config.corsOriginsFile,
      serializeCorsOrigins(port)
    )
    await removeLegacyScaffoldFile(config.corsOriginsFile)

    if (cors.enabled && config.corsFile) {
      await writeFileInDir(
        logger,
        config.corsFile,
        serializeCors(
          (name) => getLeafImportPath(config.corsFile!, name, config),
          siblingSpecifier(config.corsFile, config.corsOriginsFile)
        )
      )
      await removeLegacyScaffoldFile(config.corsFile)
    } else {
      await removeIfGenerated(config.corsFile)
    }
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating CORS scaffold',
      commandEnd: 'Generated CORS scaffold',
    }),
  ],
})
