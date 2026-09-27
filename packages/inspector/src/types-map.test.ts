import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { TypesMap } from './types-map'

describe('TypesMap.addUniqueType', () => {
  const A = '/src/functions/analytics.functions.ts'
  const B = '/tests/scenarios/analytics.steps.ts'

  test('the same path always yields the same alias', () => {
    assert.equal(
      new TypesMap().addUniqueType('RecordedEvent', A),
      new TypesMap().addUniqueType('RecordedEvent', A)
    )
  })

  test('insertion order does not change which alias a path gets', () => {
    const forward = new TypesMap()
    const forwardA = forward.addUniqueType('RecordedEvent', A)
    const forwardB = forward.addUniqueType('RecordedEvent', B)

    const reverse = new TypesMap()
    const reverseB = reverse.addUniqueType('RecordedEvent', B)
    const reverseA = reverse.addUniqueType('RecordedEvent', A)

    assert.equal(forwardA, reverseA)
    assert.equal(forwardB, reverseB)
  })

  test('distinct paths sharing a name get distinct aliases', () => {
    const typesMap = new TypesMap()
    assert.notEqual(
      typesMap.addUniqueType('RecordedEvent', A),
      typesMap.addUniqueType('RecordedEvent', B)
    )
  })

  test('the alias is what exists() hands back for that name and path', () => {
    const typesMap = new TypesMap()
    const aliasA = typesMap.addUniqueType('RecordedEvent', A)
    const aliasB = typesMap.addUniqueType('RecordedEvent', B)

    assert.equal(typesMap.exists('RecordedEvent', A), aliasA)
    assert.equal(typesMap.exists('RecordedEvent', B), aliasB)
  })
})
