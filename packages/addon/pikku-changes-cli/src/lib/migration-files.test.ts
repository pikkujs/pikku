import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { gitIn, removeThrowaways, throwawayRepo } from './test-support.js'
import {
  isMigrationPath,
  migrationFiles,
  projectRoots,
  schemaFiles,
} from './migration-files.js'

after(removeThrowaways)

/** A repo with `files` on main, then `later` committed on a branch; the git of it. */
const repo = async (
  files: Record<string, string>,
  later: Record<string, string> = {}
) => {
  const dir = await throwawayRepo(files)
  const git = gitIn(dir)
  await git(['checkout', '-q', '-b', 'changeset/1'])
  if (Object.keys(later).length) {
    for (const [path, content] of Object.entries(later)) {
      await mkdir(dirname(join(dir, path)), { recursive: true })
      await writeFile(join(dir, path), content)
    }
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', 'later'])
  }
  return git
}

const STARTER_CONFIG = JSON.stringify({ rootDir: '.' })

describe('migration files', () => {
  test('the starter layout: the config in packages/functions with rootDir ".", migrations in its db/sqlite/', async () => {
    const git = await repo({
      'packages/functions/pikku.config.json': STARTER_CONFIG,
    })
    assert.deepEqual(await projectRoots(git, ['main', 'HEAD']), [
      'packages/functions',
    ])
    assert.deepEqual(
      await migrationFiles(
        git,
        ['main', 'HEAD'],
        [
          'packages/functions/db/sqlite/0004-app-tables.sql',
          'packages/functions/db/tables.ts',
          'packages/functions/src/db/sqlite/x.sql',
          'db/sqlite/0004-app-tables.sql',
        ]
      ),
      ['packages/functions/db/sqlite/0004-app-tables.sql']
    )
  })

  test('the re-rooted layout: the same config with rootDir "../..", migrations at the repository root', async () => {
    const git = await repo({
      'packages/functions/pikku.config.json': JSON.stringify({
        rootDir: '../..',
      }),
    })
    assert.deepEqual(await projectRoots(git, ['HEAD']), [''])
    assert.deepEqual(
      await migrationFiles(
        git,
        ['HEAD'],
        [
          'db/sqlite/0004-app-tables.sql',
          'packages/functions/db/sqlite/0004-app-tables.sql',
        ]
      ),
      ['db/sqlite/0004-app-tables.sql']
    )
    assert.deepEqual(
      await schemaFiles(git, ['HEAD'], ['db/tables.ts', 'db/sqlite/x.sql']),
      ['db/tables.ts', 'db/sqlite/x.sql']
    )
  })

  test('the template layout: a root config with no rootDir', async () => {
    const git = await repo({ 'pikku.config.json': '{}' })
    assert.deepEqual(await projectRoots(git, ['HEAD']), [''])
    assert.deepEqual(
      await migrationFiles(
        git,
        ['HEAD'],
        ['db/sqlite/0001-x.sql', 'src/db/sqlite/x.sql', 'db/tables.ts']
      ),
      ['db/sqlite/0001-x.sql']
    )
  })

  test('a file named like a migration in a folder that is not a project root is not one', async () => {
    const git = await repo({ 'pikku.config.json': '{}' })
    assert.deepEqual(
      await migrationFiles(git, ['HEAD'], ['src/db/sqlite/x.sql']),
      []
    )
    assert.equal(isMigrationPath('', 'src/db/sqlite/x.sql'), false)
    assert.equal(isMigrationPath('', 'db/sqlite/nested/x.sql'), false)
  })

  test('two project roots both count', async () => {
    const git = await repo({
      'apps/a/pikku.config.json': '{}',
      'services/b/pikku.config.json': '{}',
    })
    assert.deepEqual(
      await migrationFiles(
        git,
        ['HEAD'],
        ['apps/a/db/pg/0001.sql', 'services/b/db/sqlite/0001.sql']
      ),
      ['apps/a/db/pg/0001.sql', 'services/b/db/sqlite/0001.sql']
    )
  })

  test('a project whose config the changeset adds counts at HEAD', async () => {
    const git = await repo(
      {},
      {
        'packages/functions/pikku.config.json': STARTER_CONFIG,
        'packages/functions/db/sqlite/0001-x.sql': 'create table x ();\n',
      }
    )
    assert.deepEqual(await projectRoots(git, ['main']), [])
    assert.deepEqual(
      await migrationFiles(
        git,
        ['main', 'HEAD'],
        ['packages/functions/db/sqlite/0001-x.sql']
      ),
      ['packages/functions/db/sqlite/0001-x.sql']
    )
  })

  test('as pikku changes done judges a commit: its files against its own tree and HEAD, with the real starter path', async () => {
    const git = await repo(
      { 'packages/functions/pikku.config.json': STARTER_CONFIG },
      {
        'packages/functions/db/sqlite/0004-app-tables.sql':
          'create table guestbook_entry ();\n',
      }
    )
    const sha = (await git(['rev-parse', 'HEAD'])).trim()
    const files = await git([
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '-r',
      sha,
    ])
    assert.deepEqual(
      await migrationFiles(git, [sha, 'HEAD'], files.split('\n')),
      ['packages/functions/db/sqlite/0004-app-tables.sql']
    )
  })
})
