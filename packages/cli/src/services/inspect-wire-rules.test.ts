import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from '@pikku/inspector-go'
import { CLILogger } from './cli-logger.service.js'

/**
 * The real inspector against the real logger: a computed rpc name (PKU941), a
 * wire handed to another function (PKU942), a computed workflow step name
 * (PKU943) and a call to something that does not exist (PKU944) block the
 * build, with no flag needed. The fixture is the one both inspectors are tested
 * against.
 */
const codesOf = (logger: CLILogger): string[] =>
  [...new Set((logger as any).trackedDiagnostics().map((d: any) => d.code))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b)) as string[]

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../inspector-go/testdata/wire-rules'
)

describe('inspector — the wire stays bound to the function', () => {
  test('a computed rpc name and a leaked wire are critical', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-wire-rules-'))
    const logger = new CLILogger({ silent: true })
    try {
      await cp(fixture, rootDir, { recursive: true })
      await inspect(
        logger,
        [
          join(rootDir, 'src/core.ts'),
          join(rootDir, 'src/funcs.ts'),
          join(rootDir, 'src/framework.ts'),
          join(rootDir, 'src/workflows.ts'),
        ],
        { rootDir, tsconfig: join(rootDir, 'tsconfig.json') }
      )
      assert.equal(logger.hasCriticalErrors(), true)
      const codes = codesOf(logger)
      for (const c of ['PKU941', 'PKU942', 'PKU943', 'PKU944']) {
        assert.ok(codes.includes(c), `${c} missing from ${codes.join(',')}`)
      }
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('literal names, data, wire methods, local helpers and framework calls pass', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-wire-rules-ok-'))
    const logger = new CLILogger({ silent: true })
    try {
      await cp(fixture, rootDir, { recursive: true })
      await writeFile(
        join(rootDir, 'src/funcs.ts'),
        [
          "import { pikkuSessionlessFunc } from './core.js'",
          "import { workflowService } from '../framework/index.js'",
          "const KNOWN = 'target'",
          'declare function helper(...args: unknown[]): void',
          'export const target = pikkuSessionlessFunc({',
          '  func: async () => {},',
          '})',
          'export const ok = pikkuSessionlessFunc({',
          '  func: async (services, data, wire) => {',
          '    await wire.rpc.invoke(KNOWN)',
          '    helper(services, data, wire.logger, wire.session?.userId)',
          "    await workflowService.runToCompletion('x', {}, wire.rpc)",
          '    helper(wire.http?.request, wire.rpc?.depth)',
          '  },',
          '})',
          'export const local = pikkuSessionlessFunc({',
          '  func: async (_s, data, { rpc }) => {',
          "    const viaClosure = async () => rpc.invoke('target', data)",
          "    const viaParam = (r: typeof rpc) => r.invoke('target')",
          '    await viaClosure()',
          '    await viaParam(rpc)',
          "    await Promise.all([1].map(() => rpc.invoke('target')))",
          '    const inner = (rpc: string) => helper(rpc)',
          "    inner('not a wire')",
          '  },',
          '})',
        ].join('\n')
      )
      await inspect(
        logger,
        [join(rootDir, 'src/core.ts'), join(rootDir, 'src/funcs.ts')],
        { rootDir, tsconfig: join(rootDir, 'tsconfig.json') }
      )
      assert.equal(logger.hasCriticalErrors(), false)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('the same helper at module level, given the wire, fails', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-wire-rules-mod-'))
    const logger = new CLILogger({ silent: true })
    try {
      await cp(fixture, rootDir, { recursive: true })
      await writeFile(
        join(rootDir, 'src/funcs.ts'),
        [
          "import { pikkuSessionlessFunc } from './core.js'",
          'const target = pikkuSessionlessFunc({ func: async () => {} })',
          "const viaParam = (r: { invoke(n: string): unknown }) => r.invoke('target')",
          'export const bad = pikkuSessionlessFunc({',
          '  func: async (_s, _d, { rpc }) => {',
          '    await viaParam(rpc)',
          '  },',
          '})',
          'export { target }',
        ].join('\n')
      )
      await inspect(
        logger,
        [join(rootDir, 'src/core.ts'), join(rootDir, 'src/funcs.ts')],
        { rootDir, tsconfig: join(rootDir, 'tsconfig.json') }
      )
      assert.equal(logger.hasCriticalErrors(), true)
      assert.deepEqual(codesOf(logger), ['PKU942'])
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
