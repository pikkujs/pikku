import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateZodTypes } from './zod-codegen.js'

function generate(schema: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'zod-codegen-'))
  const schemaFile = join(dir, 'schema.d.ts')
  const outFile = join(dir, 'zod.gen.ts')
  writeFileSync(schemaFile, schema, 'utf8')
  generateZodTypes({ schemaFile, outFile })
  return readFileSync(outFile, 'utf8')
}

test('classified ColumnType columns resolve to proper scalars, not z.unknown()', () => {
  const out = generate(`
export type Private<T> = T & { readonly __classification__: 'private' }

export interface AppUser {
  userId: ColumnType<Private<string>, string, string>
  email: ColumnType<Private<string> | null, string | null, string | null>
  age: ColumnType<Private<number> | null, number | null, number | null>
  active: ColumnType<Private<boolean>, boolean | number | undefined, boolean | number>
  createdAt: ColumnType<Private<Date>, Date | string | undefined, Date | string>
}
`)

  assert.match(out, /export const AppUserZ = z\.object\(\{/)
  assert.match(out, /userId: z\.string\(\),/)
  assert.match(out, /email: z\.string\(\)\.nullable\(\),/)
  assert.match(out, /age: z\.number\(\)\.nullable\(\),/)
  assert.match(out, /active: z\.boolean\(\),/)
  assert.match(out, /createdAt: z\.date\(\),/)
  // No column should degrade to unknown for the classified form.
  assert.doesNotMatch(out, /z\.unknown\(\)/)
})

test('insert schema marks columns optional when Insert admits undefined', () => {
  const out = generate(`
export type Private<T> = T & { readonly __classification__: 'private' }

export interface Room {
  roomId: ColumnType<Private<string>, string, string>
  beds: ColumnType<Private<number>, number | undefined, number>
}
`)

  const insert = out.slice(out.indexOf('RoomInsertZ'))
  // Required (no default) stays required; default-bearing column becomes optional.
  assert.match(insert, /roomId: z\.string\(\),/)
  assert.match(insert, /beds: z\.number\(\)\.optional\(\),/)
})

test('public-column shapes (Generated/bare/nested) still resolve', () => {
  const out = generate(`
export interface Widget {
  id: Generated<string>
  label: string
  note: string | null
  flag: Generated<ColumnType<boolean, boolean | number, boolean | number>>
}
`)

  // Row schema
  assert.match(out, /id: z\.string\(\),/)
  assert.match(out, /label: z\.string\(\),/)
  assert.match(out, /note: z\.string\(\)\.nullable\(\),/)
  assert.match(out, /flag: z\.boolean\(\),/)
  assert.doesNotMatch(out, /z\.unknown\(\)/)

  // Generated columns are optional on insert.
  const insert = out.slice(out.indexOf('WidgetInsertZ'))
  assert.match(insert, /id: z\.string\(\)\.optional\(\),/)
  assert.match(insert, /label: z\.string\(\),/)
  assert.match(insert, /flag: z\.boolean\(\)\.optional\(\),/)
})
