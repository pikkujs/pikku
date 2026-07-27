import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  serializeScenarioWorkflowMeta,
  serializeScenarioFunctionMeta,
} from './serialize-scenario-meta.js'
import { serializeWorkflowMeta } from '../workflow/serialize-workflow-meta.js'

/**
 * Generated files land in the user's project and are compiled by the user's
 * tsconfig against the user's dependencies. `@pikku/inspector` is a build-time
 * package a generated app has no reason to depend on, so importing it here only
 * ever worked where a package manager happened to hoist it — yarn did, bun did
 * not, and every bun template failed `tsc` with TS2307.
 */
const runtimeDeps = (source: string): string[] =>
  [...source.matchAll(/from '([^']+)'/g)]
    .map((match) => match[1]!)
    .filter((specifier) => !specifier.startsWith('.'))

describe('generated meta imports only what a generated app depends on', () => {
  test('scenario workflow meta does not import @pikku/inspector', () => {
    const source = serializeScenarioWorkflowMeta(
      '/project/.pikku/scenarios/pikku-scenario-wirings-meta.gen.ts',
      '/project/.pikku/scenarios/meta',
      './pikku-app-meta.gen.js',
      ['orderHealthScenario'],
      {},
      true
    )

    assert.deepEqual(
      runtimeDeps(source).filter((dep) => dep.startsWith('@pikku/inspector')),
      []
    )
  })

  test('scenario function meta does not import @pikku/inspector', () => {
    const source = serializeScenarioFunctionMeta(
      './meta.gen.json',
      './pikku-app-meta.gen.js',
      true
    )

    assert.deepEqual(
      runtimeDeps(source).filter((dep) => dep.startsWith('@pikku/inspector')),
      []
    )
  })

  test('workflow meta does not import @pikku/inspector', () => {
    const source = serializeWorkflowMeta(
      '/project/.pikku/workflow/pikku-workflow-wirings-meta.gen.ts',
      '/project/.pikku/workflow/meta',
      ['orderWorkflow'],
      {},
      true
    )

    assert.deepEqual(
      runtimeDeps(source).filter((dep) => dep.startsWith('@pikku/inspector')),
      []
    )
  })
})
