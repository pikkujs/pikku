import { join } from 'path'
import { pikkuSessionlessFunc } from '#pikku'
import { ErrorCode } from '@pikku/inspector'

function hashArrow(prev: string | undefined, curr: string | undefined): string {
  const p = (prev ?? 'unknown').slice(0, 8)
  const c = (curr ?? 'unknown').slice(0, 8)
  if (p === c) {
    return `${p} (unchanged)`
  }
  return `${p} → ${c}`
}

export const pikkuVersionsCheck = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()

    if (!visitState.manifest.initial) {
      const manifestPath = join(config.outDir, 'versions.json')
      throw new Error(
        `[${ErrorCode.MANIFEST_MISSING}] Version manifest not found at ${manifestPath}. Run 'pikku init' to create one.`
      )
    }

    if (visitState.manifest.errors.length > 0) {
      for (const error of visitState.manifest.errors) {
        if (
          error.code === ErrorCode.CONTRACT_CHANGED_REQUIRES_BUMP &&
          error.functionKey
        ) {
          logger.info(
            `✗ ${error.functionKey} — contract changed without version bump`
          )
          if (
            error.previousInputHash !== undefined ||
            error.currentInputHash !== undefined
          ) {
            logger.info(
              `  Input schema hash:  ${hashArrow(error.previousInputHash, error.currentInputHash)}`
            )
            logger.info(
              `  Output schema hash: ${hashArrow(error.previousOutputHash, error.currentOutputHash)}`
            )
          }
          logger.info(``)
          if (error.nextVersion !== undefined) {
            logger.info(
              `  Set \`version: ${error.nextVersion}\` on the function, then run:`
            )
          }
          logger.info(`  npx pikku versions-update`)
        } else if (
          error.code === ErrorCode.FUNCTION_VERSION_MODIFIED &&
          error.functionKey
        ) {
          logger.info(
            `✗ ${error.functionKey}@v${error.version} — published contract was modified`
          )
          if (
            error.previousInputHash !== undefined ||
            error.currentInputHash !== undefined
          ) {
            logger.info(
              `  Recorded hash: ${(error.previousInputHash ?? 'unknown').slice(0, 8)}`
            )
            logger.info(
              `  Current hash:  ${(error.currentInputHash ?? 'unknown').slice(0, 8)}`
            )
          }
          logger.info(``)
          logger.info(`  Published versions are immutable. Either revert`)
          logger.info(
            `  the schema change or create version ${(error.version ?? 1) + 1} instead.`
          )
        } else if (
          error.code === ErrorCode.VERSION_REGRESSION_OR_CONFLICT &&
          error.functionKey
        ) {
          logger.info(
            `✗ ${error.functionKey}@v${error.version} — version missing from manifest`
          )
          if (error.latestVersion !== undefined) {
            logger.info(`  Latest recorded version: ${error.latestVersion}`)
          }
          logger.info(
            `  Version ${error.version} exists in code but not in versions.json`
          )
          logger.info(``)
          logger.info(`  This usually means a merge conflict in versions.json.`)
          logger.info(`  Resolve the conflict, then run:`)
          logger.info(`  npx pikku versions-update`)
        } else if (
          error.code === ErrorCode.VERSION_GAP_NOT_ALLOWED &&
          error.functionKey
        ) {
          logger.info(
            `✗ ${error.functionKey}@v${error.version} — version gap detected`
          )
          if (error.latestVersion !== undefined) {
            logger.info(`  Latest version: ${error.latestVersion}`)
          }
          if (error.expectedNextVersion !== undefined) {
            logger.info(`  Expected next:  ${error.expectedNextVersion}`)
          }
          if (error.version !== undefined) {
            logger.info(`  Found:          ${error.version}`)
          }
          logger.info(``)
          if (error.expectedNextVersion !== undefined) {
            logger.info(
              `  Versions must be sequential. Set \`version: ${error.expectedNextVersion}\``
            )
            logger.info(`  on the function.`)
          }
        } else if (
          error.code === ErrorCode.MANIFEST_INTEGRITY_ERROR &&
          error.functionKey
        ) {
          logger.info(`✗ ${error.functionKey} — versions.json integrity error`)
          if (error.latestVersion !== undefined) {
            logger.info(`  "latest" field: ${error.latestVersion}`)
          }
          if (error.expectedNextVersion !== undefined) {
            logger.info(`  Highest version key: ${error.expectedNextVersion}`)
          }
          logger.info(``)
          logger.info(`  The manifest is corrupted. Run:`)
          logger.info(`  npx pikku versions-update`)
        } else {
          logger.info(`[${error.code}] ${error.message}`)
        }
        logger.info(``)
      }
      throw new Error('Version check failed.')
    }

    logger.info('Version manifest check passed.')
  },
})
