/**
 * Verifies the diagnostic-severity build gate end-to-end through the real CLI.
 *
 * PKU910 (a sessionless function exposing a Private-classified field) is emitted
 * at `error` severity. By default the gate only fails on `critical`, so
 * `pikku all` must still exit 0 (the dev server keeps starting) while printing
 * the finding. Passing `--fail-on-error` (e.g. at deploy) must turn the same
 * finding into a non-zero exit so leaks become blocking-with-a-recommendation.
 *
 * The temp project is created *inside the repo tree* so `@pikku/core` resolves
 * via upward node_modules traversal — a bare /tmp project cannot resolve the
 * `pikkuSessionlessFunc` import and the inspector would never see the function.
 */

import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const PIKKU_BIN = join(
  import.meta.dirname!,
  '../../../../packages/cli/dist/bin/pikku.js'
)

// Created under the verifier package so @pikku/core (hoisted to the repo-root
// node_modules) is resolvable from the scaffolded project.
const TMP_PARENT = join(import.meta.dirname!, '..', '..')

function runPikkuAll(
  dir: string,
  extraArgs: string[] = []
): { exitCode: number; output: string } {
  const res = spawnSync('node', [PIKKU_BIN, 'all', ...extraArgs], {
    cwd: dir,
    timeout: 60_000,
    encoding: 'utf8',
  })
  return {
    exitCode: res.status ?? 1,
    output: (res.stdout ?? '') + (res.stderr ?? ''),
  }
}

// Inline brand types mirror what `pikku db migrate` emits, so the inspector
// sees the structural Private<T> brand without needing the generated schema.
const BRAND_TYPES = `
type Private<T> = T & { readonly __classification__?: 'private' }
`

async function createProject(functionSource: string): Promise<string> {
  const dir = await mkdtemp(join(TMP_PARENT, '.tmp-pii-gate-'))
  await writeFile(
    join(dir, 'pikku.config.json'),
    JSON.stringify({
      srcDirectories: ['./src'],
      outDir: './.pikku',
      tsconfig: './tsconfig.json',
    })
  )
  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ['src', '.pikku'],
    })
  )
  await mkdir(join(dir, 'src'), { recursive: true })
  await writeFile(join(dir, 'src', 'funcs.ts'), functionSource)
  return dir
}

const LEAKY_FUNC = `
${BRAND_TYPES}
import { pikkuSessionlessFunc } from '@pikku/core'
export const getUser = pikkuSessionlessFunc({
  func: async () => {
    const email = 'test@example.com' as Private<string>
    return { id: 1, email }
  }
})
`

const CLEAN_FUNC = `
import { pikkuSessionlessFunc } from '@pikku/core'
export const getStatus = pikkuSessionlessFunc({
  func: async () => ({ id: 1, status: 'active' })
})
`

describe('diagnostic severity build gate — PKU910 (error severity)', () => {
  test('pikku all exits 0 on a private leak by default (prints but does not block)', async (t) => {
    const dir = await createProject(LEAKY_FUNC)
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuAll(dir)
    assert.equal(
      exitCode,
      0,
      `expected exit 0 (error severity is non-blocking by default):\n${output}`
    )
    assert.match(
      output,
      /PKU910/,
      'the leak should still be printed even though it does not block'
    )
  })

  test('pikku all --fail-on-error exits non-zero on the same private leak', async (t) => {
    const dir = await createProject(LEAKY_FUNC)
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuAll(dir, ['--fail-on-error'])
    assert.notEqual(
      exitCode,
      0,
      `expected non-zero exit under --fail-on-error:\n${output}`
    )
    assert.match(output, /PKU910/)
  })

  test('pikku all --fail-on-error exits 0 when there is no leak (no false positive)', async (t) => {
    const dir = await createProject(CLEAN_FUNC)
    t.after(() => rm(dir, { recursive: true, force: true }))

    const { exitCode, output } = runPikkuAll(dir, ['--fail-on-error'])
    assert.equal(
      exitCode,
      0,
      `clean project must pass even under --fail-on-error:\n${output}`
    )
    assert.doesNotMatch(output, /PKU910/)
  })
})
