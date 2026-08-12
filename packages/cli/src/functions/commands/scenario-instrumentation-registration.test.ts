import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const commandsDir = dirname(fileURLToPath(import.meta.url))

/**
 * The scenario runner reaches the instrumentation RPCs — coverage, stubs and
 * `pikkuScenarioGradeRun` — over HTTP against whichever local server is hosting
 * the project. Both `pikku dev` and `pikku serve` are such servers, so a
 * registration present in only one makes the runner fail with "RPC function not
 * found" depending on how the project happened to be started.
 */
describe('scenario instrumentation is registered by every local server command', () => {
  for (const command of ['dev', 'serve']) {
    test(`\`pikku ${command}\` registers it`, () => {
      const source = readFileSync(join(commandsDir, `${command}.ts`), 'utf-8')
      assert.match(
        source,
        /registerScenarioInstrumentation\(/,
        `${command}.ts never calls registerScenarioInstrumentation, so scenario runs against it cannot grade or collect coverage`
      )
      assert.match(
        source,
        /config\.scaffold\?\.scenarios/,
        `${command}.ts must gate the registration on the scenarios scaffold being enabled`
      )
    })
  }
})
