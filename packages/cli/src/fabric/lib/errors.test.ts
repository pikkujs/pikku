import { describe, test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isExpectedError } from '@pikku/core/errors'

import { FabricPreconditionError } from './errors.js'
import { assertNamedBranchDeploySafety } from './git.js'

/**
 * The refusals a user is meant to hit and act on have to read as instructions,
 * not as a crash in pikku. What makes that true is the class: the CLI runner
 * prints the message alone for an expected error and the whole stack for
 * anything else.
 */
describe('a fabric precondition refusal is an expected error', () => {
  test('the class carries the marker', () => {
    assert.strictEqual(
      isExpectedError(new FabricPreconditionError('Specify --branch.')),
      true
    )
  })

  test('a bug is still unexpected', () => {
    assert.strictEqual(isExpectedError(new TypeError('boom')), false)
  })

  test('deploy safety refuses a branch with no upstream as one', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'pikku-deploy-safety-'))
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '' },
      })
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    await writeFile(join(cwd, 'README.md'), 'hi\n')
    git('add', '.')
    git('commit', '-qm', 'first')

    await assert.rejects(
      () => assertNamedBranchDeploySafety('main', cwd),
      (error: unknown) => {
        assert.ok(error instanceof FabricPreconditionError)
        assert.strictEqual(isExpectedError(error), true)
        assert.match((error as Error).message, /has no upstream/)
        return true
      }
    )
  })
})
