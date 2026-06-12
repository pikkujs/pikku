import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { generateCustomTypes } from './custom-types-generator.js'
import { TypesMap } from '../types-map.js'

function makeTypesMap(
  entries: Record<string, { type: string; references: string[] }>
): TypesMap {
  const tm = new TypesMap()
  for (const [name, { type, references }] of Object.entries(entries)) {
    tm.addCustomType(name, type, references)
  }
  return tm
}

describe('generateCustomTypes — classification wrapper stripping', () => {
  test('strips Private<T> wrapper from type alias', () => {
    const tm = makeTypesMap({
      UserEmail: { type: 'Private<string>', references: ['Private'] },
    })
    const result = generateCustomTypes(tm, new Set())
    assert.match(result, /UserEmail/, 'should emit UserEmail alias')
    assert.match(
      result,
      /= string/,
      'Private<string> should be stripped to string'
    )
    assert.doesNotMatch(result, /Private/, 'Private wrapper must be removed')
  })

  test('strips Secret<T> wrapper from type alias', () => {
    const tm = makeTypesMap({
      HashedPw: { type: 'Secret<string>', references: ['Secret'] },
    })
    const result = generateCustomTypes(tm, new Set())
    assert.match(result, /HashedPw/)
    assert.match(
      result,
      /= string/,
      'Secret<string> should be stripped to string'
    )
    assert.doesNotMatch(result, /Secret/, 'Secret wrapper must be removed')
  })

  test('strips Pii<T> wrapper from type alias', () => {
    const tm = makeTypesMap({
      UserPhone: { type: 'Pii<string>', references: ['Pii'] },
    })
    const result = generateCustomTypes(tm, new Set())
    assert.match(result, /UserPhone/)
    assert.match(result, /= string/, 'Pii<string> should be stripped to string')
    assert.doesNotMatch(result, /Pii/, 'Pii wrapper must be removed')
  })

  test('strips nested classification wrappers', () => {
    const tm = makeTypesMap({
      Combo: {
        type: 'Private<Secret<string>>',
        references: ['Private', 'Secret'],
      },
    })
    const result = generateCustomTypes(tm, new Set())
    assert.match(result, /Combo/)
    assert.match(
      result,
      /= string/,
      'nested wrappers should resolve to inner type'
    )
    assert.doesNotMatch(
      result,
      /Private|Secret/,
      'all wrappers must be removed'
    )
  })

  test('does not strip non-classification type names', () => {
    const tm = makeTypesMap({
      MyType: { type: 'SomeOtherType', references: ['SomeOtherType'] },
    })
    const required = new Set<string>()
    generateCustomTypes(tm, required)
    assert.ok(
      required.has('SomeOtherType'),
      'non-classification references must remain in requiredTypes'
    )
  })

  test('classification wrapper references are not added to requiredTypes', () => {
    const tm = makeTypesMap({
      SensitiveField: { type: 'Private<string>', references: ['Private'] },
    })
    const required = new Set<string>()
    generateCustomTypes(tm, required)
    assert.ok(
      !required.has('Private'),
      'Private must not be added to requiredTypes'
    )
  })
})
