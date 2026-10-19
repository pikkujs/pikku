import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { toAnalysisOptions, type InspectorGoInput } from './protocol.js'
import { projectInput } from '../parity/project-input.js'
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

  test('the TypeScript engine output matches output.schema.json', async () => {
    // Through the stand-in binary rather than in this process: an in-process
    // analysis leaves bun's resolver unable to find addon metadata for any
    // test file that runs after it in the same process.
    const output = await runInspectorBinary(
      fileURLToPath(new URL('../parity/ts-reference-bin.ts', import.meta.url)),
      input
    )
    assert.ok(validateOutput(output), ajv.errorsText(validateOutput.errors))
  })

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
