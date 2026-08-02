import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { extractSecretUsage } from './extract-secret-usage.js'

const usageOf = (source: string) =>
  extractSecretUsage(
    ts.createSourceFile('/services.ts', source, ts.ScriptTarget.ESNext, true)
  )

describe('extractSecretUsage', () => {
  test('collects a literal getSecret key', () => {
    const usage = usageOf(`await secrets.getSecret('STRIPE_KEY')`)
    assert.deepEqual(usage.keys, ['STRIPE_KEY'])
    assert.deepEqual(usage.dynamic, [])
  })

  test('collects hasSecret and template literals with no substitutions', () => {
    const usage = usageOf(
      'await secrets.hasSecret(`NOTION_TOKEN`)\nawait secrets.getSecret("A")'
    )
    assert.deepEqual(usage.keys, ['A', 'NOTION_TOKEN'])
  })

  test('collects every key of a getSecrets array', () => {
    const usage = usageOf(`await secrets.getSecrets(['B', 'A'])`)
    assert.deepEqual(usage.keys, ['A', 'B'])
  })

  test('flags a computed key as dynamic', () => {
    const usage = usageOf(`await secrets.getSecret(name)`)
    assert.deepEqual(usage.keys, [])
    assert.equal(usage.dynamic.length, 1)
    assert.match(usage.dynamic[0]!, /^1:name$/)
  })

  test('flags a template literal with a substitution as dynamic', () => {
    const usage = usageOf('await secrets.getSecret(`PREFIX_${suffix}`)')
    assert.deepEqual(usage.keys, [])
    assert.equal(usage.dynamic.length, 1)
  })

  test('flags a non-array getSecrets argument as dynamic', () => {
    const usage = usageOf(`await secrets.getSecrets(keys)`)
    assert.equal(usage.dynamic.length, 1)
  })

  test('records both the literal and the dynamic keys of one call', () => {
    const usage = usageOf(`await secrets.getSecrets(['A', other])`)
    assert.deepEqual(usage.keys, ['A'])
    assert.equal(usage.dynamic.length, 1)
  })

  test('finds reads nested inside a factory body', () => {
    const usage = usageOf(`
      export const createSingletonServices = async ({ secrets }) => {
        const key = await secrets.getSecret('DEEP_KEY')
        return { thing: new Thing(key) }
      }
    `)
    assert.deepEqual(usage.keys, ['DEEP_KEY'])
  })

  test('deduplicates a key read twice', () => {
    const usage = usageOf(
      `await secrets.getSecret('A'); await secrets.getSecret('A')`
    )
    assert.deepEqual(usage.keys, ['A'])
  })

  test('ignores unrelated calls', () => {
    const usage = usageOf(`await variables.get('HOME'); logger.info('hi')`)
    assert.deepEqual(usage.keys, [])
    assert.deepEqual(usage.dynamic, [])
  })

  test('reports the line a dynamic read is on', () => {
    const usage = usageOf(`const a = 1\nconst b = 2\nsecrets.getSecret(name)`)
    assert.match(usage.dynamic[0]!, /^3:/)
  })
})
