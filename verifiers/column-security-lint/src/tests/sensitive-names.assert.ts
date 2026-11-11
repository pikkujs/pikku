/**
 * Verifies that `pikku db migrate` warns about columns whose NAME reads like
 * personal data (PKU486) or a credential (PKU487) and that nobody has
 * classified, names the fix, and goes quiet once the column is annotated.
 * Unannotated columns stay `private`: the warning never changes the types.
 */

import { mkdtemp, mkdir, writeFile, rm, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const PIKKU_BIN = join(
  import.meta.dirname!,
  '../../../../packages/cli/dist/bin/pikku.js'
)

const MIGRATION = `
CREATE TABLE IF NOT EXISTS invoice (
  invoice_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_email TEXT NOT NULL,
  api_key        TEXT NOT NULL,
  username       TEXT NOT NULL,
  token_count    INTEGER NOT NULL DEFAULT 0
);
`

async function createProject(annotations?: object): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-sensitive-names-'))
  await writeFile(
    join(dir, 'pikku.config.json'),
    JSON.stringify({
      srcDirectories: ['./src'],
      backends: { api: { filter: {} } },
      tsconfig: './tsconfig.json',
    })
  )
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'Node16',
        moduleResolution: 'Node16',
        strict: true,
      },
      include: ['src'],
    })
  )
  await mkdir(join(dir, 'db', 'sqlite'), { recursive: true })
  await mkdir(join(dir, 'src'), { recursive: true })
  await writeFile(join(dir, 'db', 'sqlite', '001_invoice.sql'), MIGRATION)
  if (annotations) {
    await writeFile(
      join(dir, 'db', 'annotations.ts'),
      `export const classifications = ${JSON.stringify(annotations, null, 2)}\n`
    )
  }
  return dir
}

function migrate(dir: string) {
  const res = spawnSync('node', [PIKKU_BIN, 'db', 'migrate'], {
    cwd: dir,
    timeout: 60_000,
    encoding: 'utf8',
  })
  return {
    exitCode: res.status ?? 1,
    output: (res.stdout ?? '') + (res.stderr ?? ''),
  }
}

describe('sensitive-looking column names', () => {
  test('unannotated customer_email and api_key warn and name the fix', async (t) => {
    const dir = await createProject()
    t.after(() => rm(dir, { recursive: true, force: true }))
    const { exitCode, output } = migrate(dir)
    assert.equal(exitCode, 0, output)
    assert.match(output, /invoice\.customer_email/)
    assert.match(output, /security: 'pii'/)
    assert.match(output, /invoice\.api_key/)
    assert.match(output, /security: 'secret'/)
    assert.match(output, /encryptColumn/)
    assert.doesNotMatch(output, /invoice\.username/)
    assert.doesNotMatch(output, /invoice\.token_count/)

    const schema = await readFile(
      join(dir, '.pikku', 'db', 'schema.gen.ts'),
      'utf-8'
    )
    assert.match(schema, /customerEmail: ColumnType<Private<string>/)
  })

  test('annotated columns are silent', async (t) => {
    const dir = await createProject({
      invoice: {
        customer_email: { security: 'pii' },
        api_key: { security: 'secret', form: 'wrapped' },
      },
    })
    t.after(() => rm(dir, { recursive: true, force: true }))
    const { exitCode, output } = migrate(dir)
    assert.equal(exitCode, 0, output)
    assert.doesNotMatch(output, /invoice\.customer_email/)
    assert.doesNotMatch(output, /invoice\.api_key/)
  })
})
