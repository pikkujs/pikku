import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(
  new URL('../scripts/vendor-schemas.mjs', import.meta.url)
)

const runtimes = [
  ['node', 'node'],
  // Pikku Studio puts bun behind `node`, so the binary's converter runs on it.
  ['bun', process.versions.bun ? process.execPath : 'bun'],
] as const

const convert = (runtime: string, lookup: unknown) =>
  spawnSync(runtime, [SCRIPT], {
    input: JSON.stringify(lookup),
    encoding: 'utf8',
    timeout: 30_000,
  })

describe('vendor-schemas.mjs', () => {
  for (const [name, runtime] of runtimes) {
    test(
      `finishes on ${name} with nothing to convert`,
      { timeout: 60_000 },
      () => {
        const result = convert(runtime, [])
        assert.equal(result.error, undefined)
        assert.equal(result.status, 0, result.stderr)
        assert.deepEqual(JSON.parse(result.stdout), { schemas: [], errors: [] })
      }
    )

    test(`imports a TypeScript source on ${name}`, { timeout: 60_000 }, () => {
      const dir = mkdtempSync(join(tmpdir(), 'vendor-schemas-'))
      try {
        const sourceFile = join(dir, 'schemas.ts')
        writeFileSync(sourceFile, 'export const present: number = 1\n')
        const result = convert(runtime, [
          ['Missing', { variableName: 'missing', sourceFile, vendor: 'zod' }],
        ])
        assert.equal(result.error, undefined)
        assert.equal(result.status, 0, result.stderr)
        const { errors } = JSON.parse(result.stdout)
        assert.equal(errors.length, 1)
        assert.match(errors[0], /Available exports: .*\bpresent\b/)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})
