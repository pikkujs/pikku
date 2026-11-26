import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findUnusedFunctions } from '@pikku/inspector'
import { createRecordingLogger } from './diagnostics.js'
import { inspect } from './inspect.js'
import { availableEngines, withEngine } from './test-engines.js'

const root = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../inspector-parity/fixtures/harness'
)
const routeFiles = readdirSync(join(root, 'src'))
  .filter((file) => file.endsWith('.ts'))
  .sort()
  .map((file) => join(root, 'src', file))

const inspectFixture = async () => {
  const logger = createRecordingLogger()
  const state = await inspect(logger, routeFiles, {
    rootDir: root,
    tsconfig: join(root, 'tsconfig.json'),
  })
  return { state, logger }
}

for (const engine of availableEngines()) {
  describe(`harness declarations (${engine})`, () => {
    test('a gate is a function whose meta carries harness, failOn and writes', async () => {
      const { state } = await withEngine(engine, inspectFixture)
      const check = state.functions.meta.check!
      assert.equal(check.harness, true)
      assert.equal(check.failOn, 'high')
      assert.deepEqual(check.writes, ['.pikku/**'])
      assert.equal(check.workflowRetries, 1)
      assert.equal(check.workflowTimeout, '5min')
      assert.deepEqual(state.functions.meta.format!.writes, ['**/*.{ts,tsx}'])
      assert.deepEqual(state.functions.meta.lint!.writes, [])
      assert.equal(state.rpc.internalMeta.check, undefined)
    })

    test('harnesses and gate agents come back from the binary as meta', async () => {
      const { state } = await withEngine(engine, inspectFixture)
      assert.deepEqual(state.harness?.harnessesMeta.build?.gates, [
        { name: 'check' },
        { name: 'format' },
        { name: 'review', failOn: 'medium' },
      ])
      assert.deepEqual(state.harness?.harnessesMeta.build?.agent, {
        model: 'default',
      })
      assert.equal(
        state.harness?.gateAgentsMeta.review?.goal,
        'The diff adds no unused code'
      )
    })

    test('a const gate list spread twice is read, one that spreads itself is refused', async () => {
      const { state, logger } = await withEngine(engine, inspectFixture)
      assert.deepEqual(state.harness?.harnessesMeta.repeatedSpread?.gates, [
        { name: 'lint' },
      ])
      assert.equal(state.harness?.harnessesMeta.selfSpread, undefined)
      assert.ok(
        logger.diagnostics.some((d) =>
          d.message.startsWith(
            "Harness 'selfSpread' lists gates that are not readable from source"
          )
        )
      )
    })

    test('an unknown gate, an unreadable list and a gate without a body are refused', async () => {
      const { logger } = await withEngine(engine, inspectFixture)
      const critical = logger.diagnostics
        .filter((d) => d.level === 'critical')
        .map((d) => `${d.code} ${d.message}`)
      for (const expected of [
        "PKU157 Harness 'typo' (src/refusals.ts) lists gate 'chek'",
        "PKU124 Harness 'computed' lists gates that are not readable from source",
        "PKU236 Harness gate 'bodiless' has no body the inspector can read.",
      ]) {
        assert.ok(
          critical.some((line) => line.startsWith(expected)),
          `missing: ${expected}\n${critical.join('\n')}`
        )
      }
    })

    test('a gate is never reported as an unused function', async () => {
      const { state } = await withEngine(engine, inspectFixture)
      const unused = findUnusedFunctions(state).map((u) => u.pikkuFuncId)
      assert.ok(!unused.includes('check') && !unused.includes('format'))
    })
  })
}
