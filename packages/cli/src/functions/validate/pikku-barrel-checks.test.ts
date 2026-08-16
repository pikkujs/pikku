import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runPikkuBarrelChecks } from './pikku-barrel-checks.js'

const write = async (root: string, rel: string, content: string) => {
  const file = join(root, rel)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

const project = async () => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-barrel-'))
  await write(root, 'pikku.config.json', '{}\n')
  return root
}

describe('pikku barrel checks', () => {
  test('flags a bare #pikku import', async () => {
    const root = await project()
    await write(
      root,
      'src/todo.function.ts',
      `import { pikkuFunc } from '#pikku'\n`
    )

    const findings = await runPikkuBarrelChecks(root)
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.severity, 'error')
    assert.match(findings[0]!.message, /#pikku/)
  })

  test('flags the hub reached as a deep file', async () => {
    const root = await project()
    await write(
      root,
      'src/todo.function.ts',
      `import { pikkuFunc } from '#pikku/pikku-types.gen.js'\n`
    )

    const findings = await runPikkuBarrelChecks(root)
    assert.equal(findings.length, 1)
  })

  test('accepts a leaf import', async () => {
    const root = await project()
    await write(
      root,
      'src/todo.function.ts',
      `import { pikkuFunc } from '#pikku/function'\nimport { wireHTTP } from '#pikku/http'\n`
    )

    assert.deepEqual(await runPikkuBarrelChecks(root), [])
  })

  test('accepts a deep generated file that is not the hub', async () => {
    const root = await project()
    await write(
      root,
      'src/client.ts',
      `import { pikkuFetch } from '#pikku/pikku-fetch.gen.js'\n`
    )

    assert.deepEqual(await runPikkuBarrelChecks(root), [])
  })

  test('ignores generated output and declaration files', async () => {
    const root = await project()
    await write(root, 'src/todo.gen.ts', `import { pikkuFunc } from '#pikku'\n`)
    await write(root, 'src/todo.d.ts', `import { pikkuFunc } from '#pikku'\n`)
    await write(root, '.pikku/thing.ts', `import { pikkuFunc } from '#pikku'\n`)
    await write(
      root,
      'node_modules/dep/index.ts',
      `import { pikkuFunc } from '#pikku'\n`
    )

    assert.deepEqual(await runPikkuBarrelChecks(root), [])
  })

  test('reports every offending file', async () => {
    const root = await project()
    await write(root, 'src/a.ts', `export * from '#pikku'\n`)
    await write(root, 'src/b.ts', `import type { X } from '#pikku'\n`)

    const findings = await runPikkuBarrelChecks(root)
    assert.equal(findings.length, 2)
  })
})
