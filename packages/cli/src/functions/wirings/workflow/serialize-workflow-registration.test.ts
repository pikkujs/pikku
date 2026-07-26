import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeWorkflowRegistration } from './serialize-workflow-registration.js'

const OUT = '/project/.pikku/workflow/pikku-workflow-wirings.gen.ts'
const META = './pikku-workflow-meta.gen.js'

const files = (entries: Array<[string, string, string]>) =>
  new Map(
    entries.map(([id, path, exportedName]) => [id, { path, exportedName }])
  )

const serialize = (
  workflows: Map<string, { path: string; exportedName: string }>,
  features: Map<string, { path: string; exportedName: string }> = new Map(),
  packageName?: string
) =>
  serializeWorkflowRegistration(
    OUT,
    META,
    [...workflows.keys()],
    workflows,
    new Map(),
    {},
    packageName,
    features
  )

describe('serializeWorkflowRegistration', () => {
  test('a project with no features is unchanged', () => {
    const output = serialize(
      files([['lazyLoad', '/project/src/credential.scenario.ts', 'lazyLoad']])
    )
    assert.match(
      output,
      /^import \{ addWorkflow \} from '@pikku\/core\/workflow'/
    )
    assert.ok(!output.includes('addFeature'))
  })

  test('a feature is imported and registered under its export name', () => {
    const output = serialize(
      files([['lazyLoad', '/project/src/credential.scenario.ts', 'lazyLoad']]),
      files([
        [
          'credentialFeature',
          '/project/src/credential.feature.ts',
          'credentialFeature',
        ],
      ])
    )
    assert.match(
      output,
      /import \{ addWorkflow, addFeature \} from '@pikku\/core\/workflow'/
    )
    assert.match(
      output,
      /import \{ credentialFeature \} from '\.\.\/\.\.\/src\/credential\.feature\.js'/
    )
    assert.match(output, /addFeature\('credentialFeature', credentialFeature\)/)
  })

  test('features register after the workflows they reference', () => {
    const output = serialize(
      files([['lazyLoad', '/project/src/credential.scenario.ts', 'lazyLoad']]),
      files([['f', '/project/src/credential.feature.ts', 'f']])
    )
    assert.ok(
      output.indexOf("addWorkflow('lazyLoad'") <
        output.indexOf("addFeature('f'"),
      'a feature resolves against registered scenarios, so it must come second'
    )
  })

  test('features are emitted in a stable order', () => {
    const output = serialize(
      new Map(),
      files([
        ['zebra', '/project/src/z.feature.ts', 'zebra'],
        ['alpha', '/project/src/a.feature.ts', 'alpha'],
      ])
    )
    assert.ok(
      output.indexOf("addFeature('alpha'") <
        output.indexOf("addFeature('zebra'")
    )
  })

  test('an addon passes its package name through', () => {
    const output = serialize(
      new Map(),
      files([['f', '/project/src/credential.feature.ts', 'f']]),
      '@acme/addon'
    )
    assert.match(output, /addFeature\('f', f, '@acme\/addon'\)/)
  })

  test('a features-only project still imports addFeature', () => {
    const output = serialize(
      new Map(),
      files([['f', '/project/src/credential.feature.ts', 'f']])
    )
    assert.match(
      output,
      /^import \{ addFeature \} from '@pikku\/core\/workflow'/
    )
  })
})
