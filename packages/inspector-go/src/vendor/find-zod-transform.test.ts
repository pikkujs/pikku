import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as z from 'zod'
import { findZodTransform } from './find-zod-transform.js'

test('a schema with no transform is reported as clean', () => {
  assert.equal(findZodTransform(z.object({ id: z.string() })), undefined)
  assert.equal(findZodTransform(z.string().min(1).trim()), undefined)
  // a refinement narrows the value, it does not change its shape
  assert.equal(
    findZodTransform(z.object({ id: z.string() }).refine(() => true)),
    undefined
  )
})

test('a transform on the schema itself is found at the root', () => {
  assert.equal(
    findZodTransform(z.object({ id: z.string() }).transform((v) => v)),
    ''
  )
})

test('a transform on a field is found by path', () => {
  assert.equal(
    findZodTransform(
      z.object({
        id: z.string(),
        when: z.string().transform((s) => new Date(s)),
      })
    ),
    '.when'
  )
})

test('a transform is found through wrappers, arrays and unions', () => {
  assert.equal(
    findZodTransform(
      z.object({ tags: z.array(z.string().transform((s) => s.trim())) })
    ),
    '.tags[]'
  )
  assert.equal(
    findZodTransform(z.object({ n: z.string().transform(Number).optional() })),
    '.n'
  )
  assert.equal(
    findZodTransform(
      z.object({ v: z.union([z.string(), z.number().transform(String)]) })
    ),
    '.v|1'
  )
  assert.equal(
    findZodTransform(
      z.object({
        m: z.record(
          z.string(),
          z.string().transform((s) => s)
        ),
      })
    ),
    '.m[]'
  )
})

test('a self-referencing schema terminates instead of recursing forever', () => {
  const node: z.ZodType = z.lazy(() =>
    z.object({ name: z.string(), children: z.array(node) })
  )
  assert.equal(findZodTransform(node), undefined)
})
