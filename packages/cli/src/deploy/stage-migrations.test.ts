import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stageMigrations } from './build-pipeline.js'

test('stageMigrations ships each engine’s SQL, and no dev seed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-stage-migrations-'))
  try {
    const project = join(dir, 'project')
    const provider = join(dir, 'out')
    mkdirSync(join(project, 'db', 'sqlite'), { recursive: true })
    mkdirSync(join(project, 'db', 'postgres'), { recursive: true })
    writeFileSync(join(project, 'db', 'sqlite', '0001-init.sql'), 'select 1;')
    writeFileSync(join(project, 'db', 'sqlite', 'notes.md'), 'not shipped')
    writeFileSync(join(project, 'db', 'postgres', '0001-init.sql'), 'select 1;')
    writeFileSync(join(project, 'db', 'sqlite-dev-seed.sql'), 'insert;')
    writeFileSync(
      join(project, 'db', 'sqlite', 'sqlite-dev-seed.sql'),
      'insert;'
    )
    writeFileSync(join(project, 'db', 'annotations.ts'), 'export {}')

    await stageMigrations(project, provider)

    assert.deepEqual(readdirSync(join(provider, 'db')).sort(), [
      'postgres',
      'sqlite',
    ])
    assert.deepEqual(readdirSync(join(provider, 'db', 'sqlite')), [
      '0001-init.sql',
    ])
    assert.deepEqual(readdirSync(join(provider, 'db', 'postgres')), [
      '0001-init.sql',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('stageMigrations drops what an earlier build staged', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-stage-migrations-'))
  try {
    const project = join(dir, 'project')
    const provider = join(dir, 'out')
    mkdirSync(join(project, 'db', 'sqlite'), { recursive: true })
    mkdirSync(join(provider, 'db', 'sqlite'), { recursive: true })
    mkdirSync(join(provider, 'db', 'postgres'), { recursive: true })
    writeFileSync(join(project, 'db', 'sqlite', '0002-next.sql'), 'select 1;')
    writeFileSync(join(provider, 'db', 'sqlite', '0001-old.sql'), 'stale')
    writeFileSync(join(provider, 'db', 'postgres', '0001-old.sql'), 'stale')
    writeFileSync(join(provider, 'db', 'sqlite-dev-seed.sql'), 'stale')

    await stageMigrations(project, provider)

    assert.deepEqual(readdirSync(join(provider, 'db')), ['sqlite'])
    assert.deepEqual(readdirSync(join(provider, 'db', 'sqlite')), [
      '0002-next.sql',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('stageMigrations writes nothing for a project without a database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-stage-migrations-'))
  try {
    await stageMigrations(join(dir, 'project'), join(dir, 'out'))
    assert.deepEqual(readdirSync(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
