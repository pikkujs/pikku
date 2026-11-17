import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'
import { declaredUnknownPathsOfZod } from './declared-unknown-paths.js'

test('collects the places the schema wrote unknown or any', () => {
  const schema = z.object({
    meta: z.record(z.string(), z.unknown()),
    payload: z.any().optional(),
    list: z.array(z.unknown()),
    name: z.string(),
  })
  assert.deepEqual([...declaredUnknownPathsOfZod(schema)].sort(), [
    '.list[]',
    '.meta[*]',
    '.payload',
  ])
})

test('a schema that declares no unknown reports none', () => {
  assert.equal(declaredUnknownPathsOfZod(z.object({ a: z.string() })).size, 0)
})
