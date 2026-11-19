import { strict as assert } from 'node:assert'
import { mkdtemp, readFile } from 'node:fs/promises'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { pikkuOtlpRunsScaffold } from './pikku-command-otlp-runs-scaffold.js'

const tempDirs: string[] = []
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

const project = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-otlp-runs-'))
  tempDirs.push(root)
  return root
}

const config = (root: string, scaffold: Record<string, unknown>) =>
  ({
    rootDir: root,
    outDir: join(root, '.pikku'),
    packageMappings: {},
    scaffold,
    otlpRunsFile: scaffold.otlpRuns
      ? join(root, 'src/scaffold/otlp/otlp-runs.gen.ts')
      : undefined,
  }) as never

const logger = { error() {}, warn() {}, info() {}, debug() {} } as never
const variables = { get: async () => undefined } as never
const run = (cfg: never) =>
  (pikkuOtlpRunsScaffold as unknown as { func: Function }).func(
    { logger, config: cfg, variables },
    undefined,
    {}
  )

describe('pikkuOtlpRunsScaffold', () => {
  test('writes the live runs file when scaffold.otlpRuns is on', async () => {
    const root = await project()
    const cfg = config(root, { otlpRuns: true })
    assert.equal(await run(cfg), true)
    const written = await readFile(
      join(root, 'src/scaffold/otlp/otlp-runs.gen.ts'),
      'utf8'
    )
    assert.match(written, /pikkuOtlpRunsSnapshot/)
    assert.match(written, /defineScope/)
  })

  test('writes nothing when scaffold.otlpRuns is off or absent', async () => {
    for (const scaffold of [{}, { otlpRuns: false }]) {
      const root = await project()
      assert.equal(await run(config(root, scaffold)), false)
      assert.equal(existsSync(join(root, 'src')), false)
    }
  })
})
