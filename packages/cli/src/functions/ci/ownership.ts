import { resolveDb } from '../db/local-db.js'
import { loadUserConfigForDb } from '../commands/db-shared.js'
import { ciEnv, worktreeOwnsDatabase } from './stages.js'

type LoadOptions = Parameters<typeof loadUserConfigForDb>[0]

/**
 * Whether the database the worktree would migrate goes when the worktree does.
 * Read from the project's own `createConfig`, as `db migrate` reads it; one that
 * cannot be read or resolved is not known to be disposable.
 */
export const worktreeOwnsConfiguredDatabase = async (
  config: LoadOptions['config'] & {
    runtimeDir?: string
    db?: Parameters<typeof resolveDb>[4]
  },
  logger: LoadOptions['logger'],
  dir: string,
  outDir: string
): Promise<boolean> => {
  // The config is read, and the database resolved, in the environment the
  // child that migrates will have (`CI=1`, no `DATABASE_URL`), not the parent's:
  // a config that branches on either would otherwise be judged on the wrong
  // branch. The parent's own environment is put back afterwards.
  const childEnv = ciEnv({ args: [], dropDatabaseUrl: true })
  const keys = ['CI', 'DATABASE_URL']
  const saved = keys.map((k) => [k, process.env[k]] as const)
  for (const k of keys) {
    if (childEnv[k] === undefined) delete process.env[k]
    else process.env[k] = childEnv[k]
  }
  try {
    // From the worktree's own copy of the config, which is what runs there.
    const inTree = { ...config, rootDir: dir }
    const userConfig = await loadUserConfigForDb({ config: inTree, logger })
    return (
      !!userConfig &&
      worktreeOwnsDatabase(
        resolveDb(userConfig, dir, outDir, config.runtimeDir, config.db),
        dir
      )
    )
  } catch {
    return false
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}
