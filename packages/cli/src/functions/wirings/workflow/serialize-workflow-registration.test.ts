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
  packageName?: string
) =>
  serializeWorkflowRegistration(
    OUT,
    META,
    [...workflows.keys()],
    workflows,
    new Map(),
    {},
    packageName
  )

describe('serializeWorkflowRegistration', () => {
  test('a workflow is imported and registered under its export name', () => {
    const output = serialize(
      files([['orderFlow', '/project/src/order.workflow.ts', 'orderFlow']])
    )
    assert.match(
      output,
      /^import \{ addWorkflow \} from '@pikku\/core\/workflow'/
    )
    assert.match(
      output,
      /import \{ orderFlow \} from '\.\.\/\.\.\/src\/order\.workflow\.js'/
    )
    assert.match(output, /addWorkflow\('orderFlow', orderFlow\)/)
  })

  test('an addon passes its package name through', () => {
    const output = serialize(
      files([['orderFlow', '/project/src/order.workflow.ts', 'orderFlow']]),
      '@acme/addon'
    )
    assert.match(
      output,
      /addWorkflow\('orderFlow', orderFlow, '@acme\/addon'\)/
    )
  })

  test('the app wirings never register a feature', () => {
    const output = serialize(
      files([['orderFlow', '/project/src/order.workflow.ts', 'orderFlow']])
    )
    assert.ok(
      !output.includes('addFeature'),
      'a feature groups scenarios, which only the scenario bootstrap may load'
    )
  })
})
