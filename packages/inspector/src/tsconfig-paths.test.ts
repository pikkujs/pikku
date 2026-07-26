import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from './inspector.js'
import type { InspectorLogger } from './types.js'

const logger: InspectorLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
}

const FACTORY = [
  'export type Config = {',
  '  name: string',
  '  func: (services: any, data: { qty: number }) => Promise<{ ok: boolean }>',
  '}',
  'export const pikkuSessionlessFunc = (config: Config): Config => config',
].join('\n')

// The parameter is deliberately unannotated: its type can only come from the
// factory's contextual type, which is exactly what an unresolved import loses.
const funcSource = (specifier: string) =>
  [
    `import { pikkuSessionlessFunc } from '${specifier}'`,
    'export const buysAnApple = pikkuSessionlessFunc({',
    "  name: 'buysAnApple',",
    '  func: async (_services, data) => ({ ok: data.qty > 0 }),',
    '})',
  ].join('\n')

const makeProject = async (specifier: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-tsconfig-paths-'))
  await mkdir(join(rootDir, 'generated'))
  await mkdir(join(rootDir, 'src'))
  await writeFile(
    join(rootDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        paths: { '#gen/*': ['./generated/*'] },
      },
    })
  )
  await writeFile(
    join(rootDir, 'package.json'),
    JSON.stringify({ type: 'module' })
  )
  await writeFile(join(rootDir, 'generated', 'factory.ts'), FACTORY)
  const funcFile = join(rootDir, 'src', 'apple.func.ts')
  await writeFile(funcFile, funcSource(specifier))
  return { rootDir, funcFile, tsconfig: join(rootDir, 'tsconfig.json') }
}

describe('tsconfig path mappings', () => {
  test('a relative import gives the function its input type', async () => {
    const { rootDir, funcFile } = await makeProject('../generated/factory.js')
    try {
      const state = await inspect(logger, [funcFile], { rootDir })
      const meta = state.functions.meta['buysAnApple']
      assert.ok(meta, 'buysAnApple meta should exist')
      assert.deepStrictEqual(meta!.inputs, ['BuysAnAppleInput'])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('an import that only resolves through tsconfig paths keeps its input type', async () => {
    const { rootDir, funcFile, tsconfig } = await makeProject('#gen/factory.js')
    try {
      const state = await inspect(logger, [funcFile], { rootDir, tsconfig })
      const meta = state.functions.meta['buysAnApple']
      assert.ok(meta, 'buysAnApple meta should exist')
      assert.deepStrictEqual(
        meta!.inputs,
        ['BuysAnAppleInput'],
        'without the project path mappings the factory resolves to `any`, and the input is silently dropped'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
