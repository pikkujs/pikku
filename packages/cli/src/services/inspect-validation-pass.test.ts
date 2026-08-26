import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '@pikku/inspector'
import { CLILogger } from './cli-logger.service.js'

/**
 * The real inspector against the real logger, reproducing what `pikku all` does
 * to a project on a build machine: inspect, generate the scaffold that declares
 * the scopes, inspect again.
 *
 * The first pass is looking at a source graph the run has not finished building
 * yet, so it is wrong by construction — the scaffold it is complaining about is
 * written by the very next step. Only the pass after that describes the project
 * as it now stands.
 */
const ROLES = [
  "import { defineSystemRole } from '@pikku/core/role'",
  'defineSystemRole({',
  "  admin: { scopes: ['virtualUser:*'] },",
  '})',
].join('\n')

const SCAFFOLD = [
  "import { defineScope } from '@pikku/core/scope'",
  'defineScope({',
  '  virtualUser: { scopes: { run: {}, read: {} } },',
  '})',
].join('\n')

describe('pikku all — a scaffold generated mid-run clears its own complaint', () => {
  test('the pass taken after the scaffold exists is the one that counts', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-validation-pass-'))
    const rolesFile = join(rootDir, 'roles.ts')
    const scaffoldFile = join(rootDir, 'virtual-user.gen.ts')
    const logger = new CLILogger({ silent: true })

    try {
      await writeFile(rolesFile, ROLES)
      await inspect(logger, [rolesFile], { rootDir })
      assert.equal(
        logger.hasCriticalErrors(),
        true,
        'virtualUser:* is genuinely undeclared while the scaffold is missing'
      )

      await writeFile(scaffoldFile, SCAFFOLD)
      await inspect(logger, [rolesFile, scaffoldFile], { rootDir })
      assert.equal(
        logger.hasCriticalErrors(),
        false,
        'the scaffold now declares virtualUser, so the run must not fail on it'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('a scope nothing ever declares still fails the run', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-validation-pass-bad-'))
    const rolesFile = join(rootDir, 'roles.ts')
    const logger = new CLILogger({ silent: true })

    try {
      await writeFile(rolesFile, ROLES)
      await inspect(logger, [rolesFile], { rootDir })
      await inspect(logger, [rolesFile], { rootDir })

      assert.equal(
        logger.hasCriticalErrors(),
        true,
        're-inspecting must not launder a real failure'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
