import { CLIError } from '@pikku/core/cli'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  resolveDb,
  generateMigrations,
  declaredSqliteConstraintNotice,
  type GeneratedMigration,
  type GenerateResult,
} from '../db/local-db.js'
import type { DestructiveChange } from '../db/table-declaration.js'
import { SQLITE_UNENFORCED_RULE } from '../db/sqlite-constraint-notice.js'
import { askYesNo } from './addon-grants.js'
import { loadUserConfigForDb } from './db-shared.js'

/**
 * Whether a person approves the changes that lose data. Asked only on a
 * terminal: a run nobody is watching has nobody to ask, so it refuses and says
 * how to approve (`--allowDestructive`).
 */
export const confirmDestructive = async (options: {
  interactive: boolean
  ask?: (question: string) => Promise<boolean>
}): Promise<boolean> =>
  options.interactive &&
  (await (options.ask ?? askYesNo)('Write these migrations? [y/N] '))

/**
 * Generate, and when the only thing in the way is a change that loses data, ask
 * for approval and write it. Anything else wrong with the declaration is not
 * something a yes can fix, so it is not asked about.
 */
export const generateWithApproval = async (
  generate: (allowDestructive?: boolean) => Promise<GenerateResult>,
  allowDestructive: boolean | undefined,
  confirm: (changes: DestructiveChange[]) => Promise<boolean>
): Promise<{ result: GenerateResult; declined: boolean }> => {
  const first = await generate(allowDestructive)
  if (first.destructive.length === 0 || first.refusals.length > 0) {
    return { result: first, declined: false }
  }
  if (!(await confirm(first.destructive))) {
    return { result: first, declined: true }
  }
  const approved = await generate(true)
  return {
    result: {
      ...approved,
      upToDate: first.upToDate,
      written: [...first.written, ...approved.written],
    },
    declined: false,
  }
}

export const dbGenerate = pikkuSessionlessFunc<
  { allowDestructive?: boolean },
  void
>({
  remote: true,
  func: async ({ logger, config, getInspectorState }, data) => {
    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) return

    const resolved = resolveDb(
      userConfig,
      config.rootDir,
      config.outDir,
      config.runtimeDir,
      config.db
    )
    if (!resolved) {
      logger.error(
        'pikku db generate: no database configured — set sqliteDb, postgresUrl or mysqlUrl in your createConfig.'
      )
      throw new Error('no database configured')
    }

    const state = await getInspectorState()
    const addons = [...state.rpc.wireAddonDeclarations.entries()].map(
      ([namespace, { package: pkg, remote, file, ui }]) => ({
        package: pkg,
        remote,
        file,
        name: namespace,
        ui,
      })
    )

    const generate = (allowDestructive?: boolean) =>
      generateMigrations(
        resolved,
        config.rootDir,
        config.srcDirectories,
        logger,
        addons,
        state.serviceAggregation.requiredServices,
        { allowDestructive }
      )
    const reportWritten = (list: GeneratedMigration[]) => {
      for (const { source, file, needsBackfill, orphaned } of list) {
        logger.info(`db generate: wrote ${file} for ${source}`)
        for (const column of orphaned) {
          logger.warn(
            `  ${column} is required but ${source} no longer writes it — the migration drops or relaxes it so inserts stop failing.`
          )
        }
        for (const column of needsBackfill) {
          logger.warn(
            `  ${column} is NOT NULL with no default — decide what existing rows get before applying.`
          )
        }
      }
    }
    const { result, declined } = await generateWithApproval(
      generate,
      data?.allowDestructive,
      async (changes) => {
        logger.error(
          'db generate: db/tables.ts asks for changes that lose data:'
        )
        for (const change of changes) logger.error(`  ${change.what}`)
        return confirmDestructive({
          interactive: !!process.stdin.isTTY && !!process.stdout.isTTY,
        })
      }
    )
    const { upToDate, written, refusals, destructive } = result
    if (declined) {
      reportWritten(written)
      logger.error(
        '  Nothing was written for them. Re-run with --allowDestructive to write them; each is marked, so `db migrate` asks once more before applying.'
      )
      throw new CLIError('db generate refused')
    }

    for (const source of upToDate) {
      logger.info(
        `db generate: ${source} is already covered by existing migrations`
      )
    }

    if (
      written.length === 0 &&
      upToDate.length === 0 &&
      !refusals.length &&
      !destructive.length
    ) {
      logger.info('db generate: nothing declares tables — nothing to generate')
      return
    }

    reportWritten(written)
    if (written.length > 0) {
      logger.info('  Review them, then run `pikku db migrate` to apply.')
    }

    if (config.validate?.rules?.[SQLITE_UNENFORCED_RULE] !== 'off') {
      const notice = await declaredSqliteConstraintNotice(resolved)
      if (notice) logger.warn(`db generate: ${notice}`)
    }

    if (destructive.length > 0) {
      logger.error(
        'db generate: db/tables.ts asks for changes that lose data, and nothing was written for them:'
      )
      for (const change of destructive) logger.error(`  ${change.what}`)
    }
    if (refusals.length > 0) {
      logger.error(
        'db generate: refused to write the migration for db/tables.ts:'
      )
      for (const refusal of refusals) logger.error(`  ${refusal}`)
      throw new CLIError('db generate refused')
    }
  },
})
