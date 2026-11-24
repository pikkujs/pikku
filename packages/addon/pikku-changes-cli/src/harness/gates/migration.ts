import { pikkuHarnessGate } from '@pikku/core/harness'
import { migrationFiles } from '../../lib/migration-files.js'
import type { Finding } from '../finding.js'
import { gitIn } from '../git.js'
import { changesetRun, declaredChangeset } from './declared.js'

/** The migrations the changeset's commits add against the base branch, in a project root of the base or HEAD. */
const addedMigrations = async (worktree: string, base: string) => {
  const git = gitIn(worktree)
  const added = await git([
    'diff',
    '--name-only',
    '--diff-filter=A',
    `${base}...HEAD`,
  ])
  return migrationFiles(git, [base, 'HEAD'], added.split('\n'))
}

/**
 * A changeset that adds a migration (a file in `db/<dir>/` of a Pikku project root, the directory holding a `pikku.config.json`) has declared the tables it creates or
 * alters on its claim, so it is ordered with the other schema changes, as `pikku changes done`
 * requires. The declaration is read from the local changes queue (the run's `storePath`, else the
 * CLI's).
 */
export const migrationGate = pikkuHarnessGate({
  name: 'migrations',
  description:
    'A changeset that adds a migration declares the tables it creates or alters',
  failOn: 'high',
  writes: [],
  func: async (_services, _data, { gate }) => {
    const added = await addedMigrations(gate.worktree, gate.base)
    if (!added.length) return []
    const { changeset, items, storePath } = changesetRun(gate)
    const declared = await declaredChangeset(
      gate.worktree,
      changeset,
      storePath
    )
    if (declared.creates.length || declared.alters.length) return []
    const ids = items.map((item) => item.shortId.replace(/^#/, ''))
    return added.map((file): Finding => ({
      file,
      severity: 'high',
      rule: 'harness/migration-declaration',
      message: `${ids.map((id) => `#${id}`).join(', ')} adds ${file} but its changeset declared no table it creates or alters. Declare them on the changeset with \`pikku changes claim --group-id ${changeset} --change-ids ${ids.join(',')} --creates <tables> --alters <tables>\` so it is ordered with the other schema changes, then stop; the checks run after you stop.`,
    }))
  },
})
