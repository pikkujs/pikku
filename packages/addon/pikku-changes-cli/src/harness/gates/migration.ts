import type { Finding } from '../finding.js'
import type { HarnessGate } from '../gate.js'
import { gitIn } from '../git.js'
import type { HarnessItem } from '../prompts.js'
import { declaredChangeset } from './declared.js'

const MIGRATION = /^db\/[^/]+\//

/** The files under `db/<dir>/` the changeset's commits add against the base branch. */
const addedMigrations = async (worktree: string, base: string) =>
  (
    await gitIn(worktree)([
      'diff',
      '--name-only',
      '--diff-filter=A',
      `${base}...HEAD`,
      '--',
      'db',
    ])
  )
    .split('\n')
    .filter((file) => MIGRATION.test(file))

/**
 * A changeset that adds a migration (a file under `db/<dir>/`) has declared the tables it creates or
 * alters on its claim, so it is ordered with the other schema changes, as `pikku changes done`
 * requires. The declaration is read from the local changes queue (`storePath`, else the CLI's).
 */
export const migrationGate = ({
  changeset,
  items,
  storePath,
}: {
  changeset: string
  items: HarnessItem[]
  storePath?: string
}): HarnessGate => ({
  name: 'migrations',
  description:
    'A changeset that adds a migration declares the tables it creates or alters',
  failOn: 'high',
  writes: [],
  run: async (wire) => {
    const added = await addedMigrations(wire.worktree, wire.base)
    if (!added.length) return []
    const declared = await declaredChangeset(
      wire.worktree,
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
