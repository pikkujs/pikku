import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { TablesDeclaration } from '@pikku/core/db'
import { tableRenameStatements, type ExistingObjects } from './table-rename.js'

const declaration = {
  columns: {
    id: { type: 'integer', primaryKey: true },
    title: { type: 'text', unique: true },
    ownerId: { type: 'integer', references: 'owner.id' },
  },
  indexes: [{ columns: ['title'] }, { columns: ['ownerId'], name: 'mine' }],
} as unknown as TablesDeclaration[string]

const FOREIGN_KEY =
  'constraint `dashboard_owner_id_fk` foreign key (`owner_id`) references `owner` (`id`) on delete restrict'

const run = (
  dialect: 'sqlite' | 'postgres' | 'mysql',
  existing: Partial<ExistingObjects>,
  desiredSql: string
) => {
  const q =
    dialect === 'mysql' ? (n: string) => `\`${n}\`` : (n: string) => `"${n}"`
  return tableRenameStatements({
    dialect,
    rename: { from: 'desk', to: 'dashboard' },
    declaration,
    desiredSql,
    existing: {
      indexes: new Set(),
      triggers: new Set(),
      foreignKeys: new Set(),
      ...existing,
    },
    quote: q,
    qualify: q,
    qualifyObject: q,
  })
}

const INDEXES = `create index "dashboard_title_idx" on "dashboard" ("title");
create index "mine" on "dashboard" ("owner_id");`

describe('tableRenameStatements', () => {
  test('postgres renames in place, and leaves a name the author wrote alone', () => {
    const { statements, kept } = run(
      'postgres',
      {
        indexes: new Set([
          'desk_title_idx',
          'mine',
          'desk_pkey',
          'desk_title_key',
        ]),
        foreignKeys: new Set(['desk_owner_id_fkey']),
      },
      INDEXES
    )
    assert.deepEqual(statements, [
      'ALTER TABLE "desk" RENAME TO "dashboard";',
      'ALTER INDEX "desk_title_idx" RENAME TO "dashboard_title_idx";',
      'ALTER TABLE "dashboard" RENAME CONSTRAINT "desk_pkey" TO "dashboard_pkey";',
      'ALTER TABLE "dashboard" RENAME CONSTRAINT "desk_title_key" TO "dashboard_title_key";',
      'ALTER TABLE "dashboard" RENAME CONSTRAINT "desk_owner_id_fkey" TO "dashboard_owner_id_fkey";',
    ])
    assert.ok(kept.has('dashboard_title_idx'))
    assert.ok(!kept.has('mine'))
  })

  test('a name the migrations never held, or already hold, is not renamed', () => {
    const { statements } = run(
      'postgres',
      { indexes: new Set(['dashboard_title_idx', 'desk_title_idx']) },
      INDEXES
    )
    assert.deepEqual(statements, ['ALTER TABLE "desk" RENAME TO "dashboard";'])
  })

  test('mysql renames indexes and swaps a foreign key for one under the new name', () => {
    const { statements } = run(
      'mysql',
      {
        indexes: new Set(['desk_title_idx', 'desk_owner_id_fk']),
        foreignKeys: new Set(['desk_owner_id_fk']),
      },
      `create index \`dashboard_title_idx\` on \`dashboard\` (\`title\`);
create table \`dashboard\` (\`id\` integer, ${FOREIGN_KEY});`
    )
    assert.deepEqual(statements, [
      'ALTER TABLE `desk` RENAME TO `dashboard`;',
      'ALTER TABLE `dashboard` RENAME INDEX `desk_title_idx` TO `dashboard_title_idx`;',
      'ALTER TABLE `dashboard` DROP FOREIGN KEY `desk_owner_id_fk`;',
      'ALTER TABLE `dashboard` RENAME INDEX `desk_owner_id_fk` TO `dashboard_owner_id_fk`;',
      `ALTER TABLE \`dashboard\` ADD ${FOREIGN_KEY};`,
    ])
  })

  test('sqlite drops the index before the table moves and keeps nothing', () => {
    const { statements, kept } = run(
      'sqlite',
      { indexes: new Set(['desk_title_idx']) },
      INDEXES
    )
    assert.deepEqual(statements, [
      'DROP INDEX "desk_title_idx";',
      'ALTER TABLE "desk" RENAME TO "dashboard";',
    ])
    assert.equal(kept.size, 0)
  })
})
