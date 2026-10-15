import { describe, test } from 'node:test'
import assert from 'node:assert'
import { changesCommands } from './contracts.js'
import * as renderers from './renderers.js'

/**
 * The CLI imports each command's renderer by name from `./renderers`. One
 * missing there is not a build error: the generated import is undefined and
 * the command prints nothing.
 */
describe('renderers', () => {
  const exported = new Set<unknown>(Object.values(renderers))

  for (const [name, command] of Object.entries(changesCommands)) {
    const render = (command as { render?: unknown }).render
    if (!render) continue
    test(`changes ${name} has its renderer exported`, () => {
      assert.ok(exported.has(render), `${name}'s renderer is not exported`)
    })
  }
})
