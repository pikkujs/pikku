import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  hashMigration,
  migrationDriftFindings,
  type StageLedger,
} from './validate.function.js'

const dir = '/repo/db/sqlite'

function stage(
  branch: string,
  migrations: StageLedger['migrations']
): StageLedger {
  return { stageId: `stage-${branch}`, branch, migrations }
}

describe('migrationDriftFindings', () => {
  test('an unchanged migration produces no finding', () => {
    const local = new Map([['0001-init.sql', hashMigration('create table a')]])
    const findings = migrationDriftFindings(dir, local, [
      stage('main', [
        {
          name: '0001-init.sql',
          hash: hashMigration('create table a'),
          appliedAt: '2026-09-01',
        },
      ]),
    ])
    assert.deepEqual(findings, [])
  })

  test('an edited migration is an error naming the stage', () => {
    const local = new Map([['0001-init.sql', hashMigration('create table b')]])
    const findings = migrationDriftFindings(dir, local, [
      stage('develop', [
        {
          name: '0001-init.sql',
          hash: hashMigration('create table a'),
          appliedAt: '2026-09-01',
        },
      ]),
    ])
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.severity, 'error')
    assert.match(findings[0]!.message, /"develop"/)
    assert.match(findings[0]!.fixHint, /NEW/)
  })

  test('a stage other than the one being pushed still reports', () => {
    const local = new Map([['0001-init.sql', hashMigration('new')]])
    const findings = migrationDriftFindings(dir, local, [
      stage('main', [
        { name: '0001-init.sql', hash: hashMigration('new'), appliedAt: 'x' },
      ]),
      stage('develop', [
        { name: '0001-init.sql', hash: hashMigration('old'), appliedAt: 'x' },
      ]),
    ])
    assert.equal(findings.length, 1)
    assert.match(findings[0]!.message, /"develop"/)
  })

  test('deleting an applied migration is an error', () => {
    const findings = migrationDriftFindings(dir, new Map(), [
      stage('main', [
        { name: '0002-gone.sql', hash: hashMigration('x'), appliedAt: 'x' },
      ]),
    ])
    assert.equal(findings.length, 1)
    assert.match(findings[0]!.message, /no longer exists locally/)
  })

  test('rows applied before hashes were recorded are info, not clean', () => {
    const local = new Map([['0001-init.sql', hashMigration('anything')]])
    const findings = migrationDriftFindings(dir, local, [
      stage('main', [{ name: '0001-init.sql', hash: null, appliedAt: 'x' }]),
    ])
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.severity, 'info')
    assert.match(findings[0]!.message, /cannot be compared/)
  })
})
