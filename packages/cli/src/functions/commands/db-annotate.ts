import { pikkuSessionlessFunc } from '#pikku/function'
import { resolveDb } from '../db/local-db.js'
import { annotateDeclaredKinds } from '../db/db-annotate.js'
import { loadUserConfigForDb } from './db-shared.js'

/** Writes a `kind` into db/annotations.ts for each SQLite column declared BOOLEAN, DATE/DATETIME/TIMESTAMP or JSON, so it types as boolean, Date or parsed JSON. */
export const dbAnnotate = pikkuSessionlessFunc<{}, void>({
  func: async ({ logger, config }) => {
    const userConfig = await loadUserConfigForDb({ config, logger })
    if (!userConfig) return
    const resolved = resolveDb(
      userConfig,
      config.rootDir,
      config.outDir,
      config.runtimeDir,
      config.db
    )
    if (!resolved) throw new Error('no database configured')

    const result = await annotateDeclaredKinds(resolved)
    const out = (line: string) => process.stdout.write(`${line}\n`)
    if (result.status === 'not-sqlite') {
      out(`${resolved.dialect} reports real column types; nothing to annotate.`)
    } else if (result.status === 'up-to-date') {
      out('Every BOOLEAN, DATE/TIMESTAMP and JSON column already has a kind.')
    } else if (result.status === 'written') {
      out(`${result.file}: added ${result.added.join(', ')}`)
      out('Run `pikku db migrate` to regenerate the types.')
    } else {
      out(
        `${result.file} has hand-written entries; add these kinds yourself: ${result.missing.join(', ')}`
      )
    }
  },
})
