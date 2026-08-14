import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import type { FunctionsMeta } from '@pikku/core/ecosystem/services'
import { partitionRequiredSchemas } from './scenario-schema-partition.js'

const identity = (name: string) => name

const meta = (
  entries: Record<
    string,
    {
      inputs?: string[]
      outputs?: string[]
      scenario?: boolean
      scenarioStep?: boolean
    }
  >
): FunctionsMeta =>
  Object.fromEntries(
    Object.entries(entries).map(([name, value]) => [
      name,
      { pikkuFuncId: name, ...value },
    ])
  ) as unknown as FunctionsMeta

describe('partitionRequiredSchemas', () => {
  test('a schema only a scenario or a step needs is kept out of the app register', () => {
    const { appRequired, scenarioOnly } = partitionRequiredSchemas({
      functionsMeta: meta({
        createTodo: { inputs: ['CreateTodoInput'] },
        loginScenario: { inputs: ['LoginScenarioInput'], scenario: true },
        opensPage: { inputs: ['OpensPageInput'], scenarioStep: true },
      }),
      requiredSchemas: new Set([
        'CreateTodoInput',
        'LoginScenarioInput',
        'OpensPageInput',
      ]),
      getUniqueName: identity,
    })

    assert.deepEqual([...appRequired], ['CreateTodoInput'])
    assert.deepEqual([...scenarioOnly].sort(), [
      'LoginScenarioInput',
      'OpensPageInput',
    ])
  })

  test('a schema an application function also needs stays on the app side only', () => {
    const { appRequired, scenarioOnly } = partitionRequiredSchemas({
      functionsMeta: meta({
        createTodo: { inputs: ['TodoInput'] },
        createsTodo: { inputs: ['TodoInput'], scenarioStep: true },
      }),
      requiredSchemas: new Set(['TodoInput']),
      getUniqueName: identity,
    })

    assert.deepEqual([...appRequired], ['TodoInput'])
    assert.deepEqual([...scenarioOnly], [])
  })

  test('a type asked for by hand stays registered for the app', () => {
    const { appRequired, scenarioOnly } = partitionRequiredSchemas({
      functionsMeta: meta({
        opensPage: { inputs: ['PublishedEvent'], scenarioStep: true },
      }),
      requiredSchemas: new Set(['PublishedEvent']),
      getUniqueName: identity,
      schemasFromTypes: ['PublishedEvent'],
    })

    assert.deepEqual([...appRequired], ['PublishedEvent'])
    assert.deepEqual([...scenarioOnly], [])
  })

  test('every partition is a partition of requiredSchemas — nothing is invented, nothing is lost', () => {
    // The two sets are both derived from `requiredSchemas`, so a name the
    // scenario side claims is removed from the app side by construction. A schema
    // named under a key `requiredSchemas` does not use (a naming disagreement
    // between the inspector and this split) can only fail to be moved — it can
    // never be added to the app register that would not otherwise be there.
    const requiredSchemas = new Set(['A', 'B'])
    const { appRequired, scenarioOnly } = partitionRequiredSchemas({
      functionsMeta: meta({
        appFn: { inputs: ['A'] },
        scenarioFn: { inputs: ['B'], outputs: ['NotRequired'], scenario: true },
      }),
      requiredSchemas,
      getUniqueName: identity,
    })

    assert.deepEqual([...appRequired, ...scenarioOnly].sort(), ['A', 'B'])
    for (const name of [...appRequired, ...scenarioOnly]) {
      assert.ok(requiredSchemas.has(name), `${name} was invented`)
    }
    assert.ok(!scenarioOnly.has('NotRequired'))
  })

  test('the scenario register is empty for a project with no scenarios', () => {
    const { appRequired, scenarioOnly } = partitionRequiredSchemas({
      functionsMeta: meta({ createTodo: { inputs: ['CreateTodoInput'] } }),
      requiredSchemas: new Set(['CreateTodoInput']),
      getUniqueName: identity,
    })

    assert.deepEqual([...appRequired], ['CreateTodoInput'])
    assert.equal(scenarioOnly.size, 0)
  })
})
