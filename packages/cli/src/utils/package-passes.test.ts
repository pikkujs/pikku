import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import {
  PACKAGE_PASS_ENV,
  PikkuPackagePassError,
  runPikkuPackagePasses,
} from './package-passes.js'

const roots: string[] = []
const argv1 = process.argv[1]
afterEach(async () => {
  process.argv[1] = argv1!
  await Promise.all(
    roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))
  )
})

/**
 * The pass re-executes the running CLI (`process.argv[1]`) as `pikku all` in the
 * package's directory. A stand-in script records where it ran and with which
 * flag, and fails in the directory named by `failIn`.
 */
const setup = async (failIn?: string) => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-passes-'))
  roots.push(root)
  const log = join(root, 'log.txt')
  const script = join(root, 'pikku.mjs')
  await writeFile(
    script,
    `import { appendFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(log)}, process.cwd().split('/').pop() + ' ' + process.argv[2] + ' ' + process.env.${PACKAGE_PASS_ENV} + '\\n')
if (process.cwd().endsWith(${JSON.stringify(failIn ?? '\0')})) {
  console.log('out from the failing pass')
  console.error('error from the failing pass')
  process.exit(7)
}
`
  )
  process.argv[1] = script
  const pkg = async (name: string) => {
    const dir = join(root, name)
    await mkdir(dir, { recursive: true })
    return { entry: `packages/${name}`, dir }
  }
  return { log, pkg }
}

describe('runPikkuPackagePasses', () => {
  test('runs `pikku all` in each package in order, with the package-pass flag', async () => {
    const { log, pkg } = await setup()
    const seen: string[] = []
    await runPikkuPackagePasses(
      [await pkg('lib'), await pkg('app')],
      (p) => void seen.push(p.entry)
    )
    assert.deepEqual(seen, ['packages/lib', 'packages/app'])
    assert.equal(await readFile(log, 'utf8'), 'lib all 1\napp all 1\n')
  })

  test('stops at the first failing pass with its package, exit code and output', async () => {
    const { log, pkg } = await setup('lib')
    const seen: string[] = []
    await assert.rejects(
      runPikkuPackagePasses(
        [await pkg('lib'), await pkg('app')],
        (p) => void seen.push(p.entry)
      ),
      (error: unknown) => {
        assert.ok(error instanceof PikkuPackagePassError)
        assert.equal(error.entry, 'packages/lib')
        assert.equal(error.exitCode, 7)
        assert.match(
          error.message,
          /pikku all failed in packages\/lib \(exit code 7\)/
        )
        assert.match(error.message, /out from the failing pass/)
        assert.match(error.message, /error from the failing pass/)
        return true
      }
    )
    assert.deepEqual(seen, ['packages/lib'])
    assert.equal(await readFile(log, 'utf8'), 'lib all 1\n')
  })
})
