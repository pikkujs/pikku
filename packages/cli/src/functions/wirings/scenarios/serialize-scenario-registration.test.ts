import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { serializeScenarioRegistration } from './serialize-scenario-registration.js'
import {
  serializeScenarioFunctionMeta,
  serializeScenarioWorkflowMeta,
} from './serialize-scenario-meta.js'

const file = (name: string) => [
  name,
  { path: `/project/src/scenarios/${name}.ts`, exportedName: name },
]

describe('the scenario wirings file', () => {
  test('a project with no scenarios emits nothing importable', () => {
    const output = serializeScenarioRegistration(
      '/project/.pikku/scenarios/pikku-scenario-wirings.gen.ts',
      './pikku-scenario-wirings-meta.gen.js',
      new Map(),
      new Map(),
      {}
    )
    assert.equal(output, 'export {}')
  })

  test('scenarios and features register together', () => {
    const output = serializeScenarioRegistration(
      '/project/.pikku/scenarios/pikku-scenario-wirings.gen.ts',
      './pikku-scenario-wirings-meta.gen.js',
      new Map([file('codeEditorScenario')] as any),
      new Map([file('addonsFeature')] as any),
      {}
    )

    assert.ok(
      output.includes(
        `import { addWorkflow } from '@pikku/core/workflow'
import { addFeature } from '@pikku/core/scenario'`
      )
    )
    assert.ok(
      output.includes(`addWorkflow('codeEditorScenario', codeEditorScenario)`)
    )
    assert.ok(output.includes(`addFeature('addonsFeature', addonsFeature)`))
    assert.ok(
      output.indexOf('addWorkflow(') < output.indexOf('addFeature('),
      'a feature resolves membership by identity, so its scenarios must register first'
    )
  })

  test('features are emitted in a stable order', () => {
    const output = serializeScenarioRegistration(
      '/project/.pikku/scenarios/pikku-scenario-wirings.gen.ts',
      './pikku-scenario-wirings-meta.gen.js',
      new Map(),
      new Map([file('zebraFeature'), file('alphaFeature')] as any),
      {}
    )
    assert.ok(
      output.indexOf("addFeature('alphaFeature'") <
        output.indexOf("addFeature('zebraFeature'")
    )
  })

  test('a features-only project still imports addFeature', () => {
    const output = serializeScenarioRegistration(
      '/project/.pikku/scenarios/pikku-scenario-wirings.gen.ts',
      './pikku-scenario-wirings-meta.gen.js',
      new Map(),
      new Map([file('addonsFeature')] as any),
      {}
    )
    assert.match(
      output,
      /^import \{ addFeature \} from '@pikku\/core\/workflow'/
    )
  })

  test('an addon passes its package name through', () => {
    const output = serializeScenarioRegistration(
      '/project/.pikku/scenarios/pikku-scenario-wirings.gen.ts',
      './pikku-scenario-wirings-meta.gen.js',
      new Map(),
      new Map([file('addonsFeature')] as any),
      {},
      '@acme/addon'
    )
    assert.match(
      output,
      /addFeature\('addonsFeature', addonsFeature, '@acme\/addon'\)/
    )
  })
})

describe('the scenario meta files merge rather than replace', () => {
  test('workflow meta spreads the state it found', () => {
    const output = serializeScenarioWorkflowMeta(
      '/project/.pikku/scenarios/pikku-scenario-wirings-meta.gen.ts',
      '/project/.pikku/scenarios/meta',
      '../workflow/pikku-workflow-wirings-meta.gen.js',
      ['codeEditorScenario'],
      {},
      true
    )

    assert.ok(
      output.includes(
        `import '../workflow/pikku-workflow-wirings-meta.gen.js'`
      ),
      "the app's wholesale setter has to run first, whichever entry point loads this"
    )
    assert.ok(
      output.includes(`...pikkuState(null, 'workflows', 'meta'),`),
      'replacing the map would unregister every app workflow'
    )
    assert.ok(output.includes(`'codeEditorScenario': codeEditorScenarioMeta,`))
  })

  test('function meta spreads the state it found', () => {
    const output = serializeScenarioFunctionMeta(
      './pikku-scenario-functions-meta.gen.json',
      '../function/pikku-functions-meta.gen.js',
      true
    )

    assert.ok(
      output.includes(`import '../function/pikku-functions-meta.gen.js'`)
    )
    assert.ok(output.includes(`...pikkuState(null, 'function', 'meta'),`))
    assert.ok(
      output.includes(`with { type: 'json' }`),
      'the JSON import attribute has to follow the project’s module settings'
    )
  })
})
