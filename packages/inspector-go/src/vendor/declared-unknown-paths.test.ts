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

test('records unknowns at any depth', () => {
  let deep: z.ZodType = z.unknown()
  for (let i = 0; i < 20; i++) deep = z.object({ next: deep })
  const [path] = [...declaredUnknownPathsOfZod(deep)]
  assert.equal(path, '.next'.repeat(20))
})

test('records a catchall and the output side of a pipe', () => {
  assert.deepEqual([...declaredUnknownPathsOfZod(z.looseObject({ a: z.string() }))], ['[*]'])
  assert.deepEqual([...declaredUnknownPathsOfZod(z.object({ a: z.string() }).catchall(z.any()))], ['[*]'])
  assert.deepEqual([...declaredUnknownPathsOfZod(z.string().pipe(z.any()))], ['$'])
})

test('terminates on a recursive lazy schema', () => {
  type Tree = { children: Tree[]; meta: unknown }
  const tree: z.ZodType<Tree> = z.object({
    children: z.array(z.lazy(() => tree)),
    meta: z.unknown(),
  })
  assert.deepEqual([...declaredUnknownPathsOfZod(tree)], ['.meta'])
})
