/**
 * Verifies that `pikku db audit` produces a readable classification summary
 * with correct per-column counts and warns on private/secret columns that
 * have no anonymize strategy.
 *
 * Classification is authored in `db/annotations.ts` (the single source).
 */

import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const PIKKU_BIN = join(
  import.meta.dirname!,
  '../../../../packages/cli/dist/bin/pikku.js'
)

type ColumnEntry = {
  security?: 'public' | 'private' | 'pii' | 'secret' | 'encrypted'
  classification?: 'fake:email' | 'fake:name' | 'hash' | 'keep'
}
type Annotations = Record<string, Record<string, ColumnEntry>>

function runPikku(
  dir: string,
  args: string[]
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync('node', [PIKKU_BIN, ...args], {
    cwd: dir,
    encoding: 'utf-8',
    timeout: 30_000,
  })
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

async function createProject(
  migrationSql: string,
  annotations?: Annotations
): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'pikku-audit-test-'))
  await writeFile(
    join(tmpDir, 'pikku.config.json'),
    JSON.stringify({
      srcDirectories: ['./src'],
      outDir: './.pikku',
      tsconfig: './tsconfig.json',
    })
  )
  await writeFile(
    join(tmpDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'Node16', moduleResolution: 'Node16', strict: true },
      include: ['src'],
    })
  )
  await mkdir(join(tmpDir, 'db', 'sqlite'), { recursive: true })
  await mkdir(join(tmpDir, 'src'), { recursive: true })
  await writeFile(join(tmpDir, 'db', 'sqlite', '001_init.sql'), migrationSql)
  if (annotations) {
    await writeFile(
      join(tmpDir, 'db', 'annotations.ts'),
      `export const classifications = ${JSON.stringify(annotations, null, 2)}\n`
    )
  }
  return tmpDir
}

describe('DB audit command', () => {
  test('prints per-table column classification summary', async (t) => {
    const dir = await createProject(
      `
      CREATE TABLE users (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token TEXT NOT NULL
      );
    `,
      {
        users: {
          id: { security: 'public' },
          email: { security: 'private', classification: 'fake:email' },
          token: { security: 'secret', classification: 'hash' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const migrate = runPikku(dir, ['db', 'migrate'])
    assert.equal(migrate.exitCode, 0, `migrate failed: ${migrate.stdout}`)

    const audit = runPikku(dir, ['db', 'audit'])
    assert.equal(audit.exitCode, 0, `audit failed: ${audit.stdout}\n${audit.stderr}`)

    const combined = audit.stdout + audit.stderr
    assert.match(combined, /users/, 'output must mention the table name')
    assert.match(combined, /public/, 'output must mention public classification')
    assert.match(combined, /private/, 'output must mention private classification')
    assert.match(combined, /secret/, 'output must mention secret classification')
  })

  test('prints column counts in summary line', async (t) => {
    const dir = await createProject(
      `
      CREATE TABLE data (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        a    TEXT NOT NULL,
        b    TEXT NOT NULL
      );
    `,
      {
        data: {
          id: { security: 'public' },
          a: { security: 'private', classification: 'fake:email' },
          b: { security: 'secret', classification: 'hash' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const migrate1 = runPikku(dir, ['db', 'migrate'])
    assert.equal(migrate1.exitCode, 0, `migrate failed: ${migrate1.stdout}\n${migrate1.stderr}`)
    const audit = runPikku(dir, ['db', 'audit'])
    assert.equal(audit.exitCode, 0, `audit failed: ${audit.stdout}\n${audit.stderr}`)

    const combined = audit.stdout + audit.stderr
    // Summary line: "3 columns total — 1 public, 1 private, 1 secret"
    assert.match(combined, /3 columns total/, 'should report total column count')
    assert.match(combined, /1 public/, 'should report 1 public column')
    assert.match(combined, /1 private/, 'should report 1 private column')
    assert.match(combined, /1 secret/, 'should report 1 secret column')
  })

  test('warns when private/secret columns have no anonymize strategy', async (t) => {
    const dir = await createProject(
      `
      CREATE TABLE items (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
    `,
      {
        items: {
          id: { security: 'public' },
          name: { security: 'private' }, // no strategy
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const migrate2 = runPikku(dir, ['db', 'migrate'])
    assert.equal(migrate2.exitCode, 0, `migrate failed: ${migrate2.stdout}\n${migrate2.stderr}`)
    const audit = runPikku(dir, ['db', 'audit'])
    assert.equal(audit.exitCode, 0, `audit failed: ${audit.stdout}\n${audit.stderr}`)

    const combined = audit.stdout + audit.stderr
    assert.match(
      combined,
      /no anonymize strategy|will be NULL|NULLed/i,
      'should warn about columns with no strategy'
    )
    assert.match(combined, /items\.name/, 'should name the table.column with no strategy')
  })

  test('does not warn when all private columns have explicit strategies', async (t) => {
    const dir = await createProject(
      `
      CREATE TABLE safe (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        slug  TEXT NOT NULL
      );
    `,
      {
        safe: {
          id: { security: 'public' },
          email: { security: 'private', classification: 'fake:email' },
          slug: { security: 'private', classification: 'keep' },
        },
      }
    )
    t.after(() => rm(dir, { recursive: true, force: true }))

    const migrate3 = runPikku(dir, ['db', 'migrate'])
    assert.equal(migrate3.exitCode, 0, `migrate failed: ${migrate3.stdout}\n${migrate3.stderr}`)
    const audit = runPikku(dir, ['db', 'audit'])
    assert.equal(audit.exitCode, 0, `audit failed: ${audit.stdout}\n${audit.stderr}`)

    const combined = audit.stdout + audit.stderr
    // The warning-bearing line includes "have no anonymize strategy"
    assert.doesNotMatch(combined, /have no anonymize strategy/i)
  })

  test('fails gracefully when manifest has not been generated yet', async (t) => {
    const dir = await createProject(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT);
    `)
    t.after(() => rm(dir, { recursive: true, force: true }))

    // Skip migrate — no classification.gen.ts
    const audit = runPikku(dir, ['db', 'audit'])
    // Should exit non-zero with a helpful message
    assert.notEqual(audit.exitCode, 0, 'audit should fail without manifest')
    const combined = audit.stdout + audit.stderr
    assert.match(
      combined,
      /manifest not found|pikku db migrate|classification/i,
      'error message should guide the user'
    )
  })
})
