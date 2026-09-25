import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  PikkuNewAppInput,
  PikkuNewAppOutputSchema,
} from './new-app.schemas.js'

const source = readFileSync(
  fileURLToPath(new URL('./new-app.schemas.ts', import.meta.url)),
  'utf8'
)

describe('new-app schemas', () => {
  /**
   * Schema generation imports and runs the file a schema is declared in. A
   * `#pikku/*` import there resolves into `dist/.pikku`, which on a clean tree
   * is written by the very run that is trying to read this file — so the
   * import fails and the build dies on `SingletonServices resolved to no
   * services at all`, several steps away from the cause.
   */
  test('the declaring file imports nothing generated', () => {
    const generated = source
      .split('\n')
      .filter((line) => /^\s*(import|export)\b/.test(line))
      .filter((line) => line.includes("'#pikku/"))
    assert.deepEqual(
      generated,
      [],
      'new-app.schemas.ts imports a generated leaf, which schema generation cannot resolve'
    )
  })

  test('the schemas are the command contract', () => {
    assert.deepEqual(
      Object.keys(PikkuNewAppInput.shape).sort(),
      ['install', 'personas', 'primary', 'serves', 'slug', 'template']
    )
    assert.deepEqual(
      Object.keys(PikkuNewAppOutputSchema.shape).sort(),
      ['path', 'port', 'refusal', 'repaired', 'slug']
    )
  })
})
