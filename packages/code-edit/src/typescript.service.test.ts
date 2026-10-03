import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { TypeScriptService } from './typescript.service.js'

const project = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-ts-'))
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'x',
      type: 'module',
      imports: { '#lib/*': './src/lib/*.ts' },
    })
  )
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: true,
        allowImportingTsExtensions: true,
      },
      include: ['src'],
    })
  )
  await mkdir(join(root, 'src/lib'), { recursive: true })
  await writeFile(
    join(root, 'src/lib/math.ts'),
    'export const add = (a: number, b: number) => a + b\n'
  )
  await writeFile(
    join(root, 'src/index.ts'),
    "import { add } from '#lib/math'\nexport const n: number = add(1, 2)\n"
  )
  return root
}

describe('TypeScriptService', () => {
  test('resolves package.json imports through the project tsconfig', async () => {
    const ts = new TypeScriptService(await project())
    assert.deepStrictEqual(ts.diagnostics('src/index.ts'), [])
  })

  test('checks unsaved content against the rest of the project', async () => {
    const ts = new TypeScriptService(await project())
    const [d] = ts.diagnostics(
      'src/index.ts',
      "import { add } from '#lib/math'\nexport const n: string = add(1, 2)\n"
    )
    assert.strictEqual(d?.code, 2322)
    assert.strictEqual(d?.startLine, 2)
    assert.deepStrictEqual(ts.diagnostics('src/index.ts'), [])
  })

  test('skips files that are not code', async () => {
    const ts = new TypeScriptService(await project())
    assert.deepStrictEqual(ts.diagnostics('package.json'), [])
  })
  test('a catch-all base tsconfig does not claim files, so JSX still works', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-ts-'))
    await writeFile(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true } })
    )
    await mkdir(join(root, 'web'), { recursive: true })
    await writeFile(
      join(root, 'web/main.tsx'),
      'export const el = <div data-testid="x" />\n'
    )
    const codes = new TypeScriptService(root)
      .diagnostics('web/main.tsx')
      .map((d) => d.code)
    assert.ok(!codes.includes(17004), `got ${codes}`)
  })
})
