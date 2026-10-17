import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { inspect as inspectWithBinary } from './inspect.js'
import { createRecordingLogger } from './diagnostics.js'
import { projectInput } from '../parity/project-input.js'
import { comparableState, diffPaths } from '../parity/comparable.js'
import { runTypeScript } from '../parity/run-ts.js'

/**
 * The staging proof for the two-phase split: a state that crosses a JSON
 * boundary between analysis and finalize comes out the same as `inspect`.
 * Each inspection runs in its own process (see parity/ts-run.ts).
 */

const repo = (path: string) =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url))

// Only projects the build generates: their Zod schemas import from `.pikku`,
// and CI's build output carries it for templates/ but not examples/.
const PROJECTS = ['templates/functions']

const assertSame = (actual: unknown, expected: unknown) => {
  assert.deepStrictEqual(diffPaths(actual, expected), [])
  assert.deepStrictEqual(actual, expected)
}

for (const project of PROJECTS) {
  describe(`ts-roundtrip: ${project}`, () => {
    const reference = runTypeScript('reference', repo(project))
    const roundtrip = runTypeScript('roundtrip', repo(project))

    test('the reference found something to compare', () => {
      const functions = (reference.post as any).functions.meta
      assert.ok(Object.keys(functions).length > 0)
    })

    test('serialize then deserialize loses nothing analysis produced', () => {
      assert.deepStrictEqual(roundtrip.serializationDiffs, [])
    })

    test('finalize(deserialize(serialize(analyze()))) equals inspect()', () => {
      assertSame(roundtrip.post, reference.post)
      assertSame(roundtrip.postDiagnostics, reference.postDiagnostics)
    })

    // Spawns a full TypeScript inspection of the project.
    test(
      'the binary wrapper, fed by the TypeScript engine, equals inspect()',
      { timeout: 120_000 },
      async () => {
        const previous = process.env.PIKKU_INSPECTOR_GO_BIN
        process.env.PIKKU_INSPECTOR_GO_BIN = fileURLToPath(
          new URL('../parity/ts-reference-bin.ts', import.meta.url)
        )
        process.env.PIKKU_TS_REFERENCE_FINALIZE = '1'
        try {
          const { routeFiles, options } = await projectInput(repo(project))
          const logger = createRecordingLogger()
          const state = await inspectWithBinary(logger, routeFiles, options)
          assertSame(comparableState(state), reference.post)
          assertSame(
            logger.diagnostics.filter((d) => d.level !== 'debug'),
            reference.postDiagnostics
          )
        } finally {
          delete process.env.PIKKU_TS_REFERENCE_FINALIZE
          if (previous === undefined) delete process.env.PIKKU_INSPECTOR_GO_BIN
          else process.env.PIKKU_INSPECTOR_GO_BIN = previous
        }
      }
    )
  })
}
