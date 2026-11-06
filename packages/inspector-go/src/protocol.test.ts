import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { toAnalysisOptions, type InspectorGoInput } from './protocol.js'
import { projectInput } from './test-project-input.js'
import { findInspectorBinary } from './binary.js'
import { availableEngines } from './test-engines.js'
import { runInspectorBinary } from './run-binary.js'

const schema = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../protocol/${name}.schema.json`, import.meta.url)
      ),
      'utf8'
    )
  )

const ajv = new Ajv({ allErrors: true, strict: false })
const validateInput = ajv.compile(schema('input'))
const validateOutput = ajv.compile(schema('output'))

describe('protocol JSON Schemas', async () => {
  const project = fileURLToPath(
    new URL('../../../recipes/functions', import.meta.url)
  )
  const { routeFiles, options } = await projectInput(project)
  const input: InspectorGoInput = {
    routeFiles,
    options: toAnalysisOptions(options),
  }

  test('the input the wrapper sends matches input.schema.json', () => {
    assert.ok(validateInput(input), ajv.errorsText(validateInput.errors))
  })

  for (const engine of availableEngines()) {
    test(`the ${engine} engine output matches output.schema.json`, async () => {
      const output = await runInspectorBinary(
        findInspectorBinary(process.env, { engine }),
        input
      )
      assert.ok(validateOutput(output), ajv.errorsText(validateOutput.errors))
    })
  }

  test('a critical without a code is rejected', () => {
    const output = {
      protocol: 1,
      finalized: false,
      state: { rootDir: '/p' },
      diagnostics: [{ level: 'critical', message: 'no code' }],
      stats: {
        files: 0,
        projectFiles: 0,
        types: 0,
        symbols: 0,
        wallMs: 0,
        heapUsedMb: 0,
      },
    }
    assert.equal(validateOutput(output), false)
    output.diagnostics[0] = {
      level: 'critical',
      code: 'PKU123',
      message: 'coded',
    } as any
    assert.equal(validateOutput(output), true)
  })
})
