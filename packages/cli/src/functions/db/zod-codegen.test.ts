import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  generateZodTypes,
  type ZodFormat,
  type ZodCodegenOptions,
} from './zod-codegen.js'

function generate(
  schema: string,
  formats?: ZodCodegenOptions['formats']
): string {
  const dir = mkdtempSync(join(tmpdir(), 'zod-codegen-'))
  const schemaFile = join(dir, 'schema.d.ts')
  const outFile = join(dir, 'zod.gen.ts')
  writeFileSync(schemaFile, schema, 'utf8')
  generateZodTypes({ schemaFile, outFile, formats })
  return readFileSync(outFile, 'utf8')
}

test('classified ColumnType columns resolve to proper scalars, not z.unknown()', () => {
  const out = generate(`
export type Private<T> = T & { readonly __classification__?: 'private' }

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
export type Private<T> = T & { readonly __classification__?: 'private' }

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

test('string-literal unions (enum columns) map to z.enum / z.literal', () => {
  const out = generate(`
export type Private<T> = T & { readonly __classification__?: 'private' }

export interface Account {
  role: 'admin' | 'user' | 'guest'
  status: ColumnType<Private<'active' | 'banned'>, 'active' | 'banned', 'active' | 'banned'>
  tier: 'free' | null
  only: 'solo'
}
`)

  assert.match(out, /role: z\.enum\(\['admin', 'user', 'guest'\]\),/)
  // Enum inside a classification brand resolves too.
  assert.match(out, /status: z\.enum\(\['active', 'banned'\]\),/)
  // Nullable single-literal keeps the `.nullable()` suffix.
  assert.match(out, /tier: z\.literal\('free'\)\.nullable\(\),/)
  // A single literal degrades to z.literal, not z.enum.
  assert.match(out, /only: z\.literal\('solo'\),/)
  assert.doesNotMatch(out, /z\.unknown\(\)/)
})

test('format hints refine string columns to the right zod validator', () => {
  const formats: Record<string, Record<string, ZodFormat>> = {
    User: {
      email: 'email',
      website: 'url',
      phone: 'e164',
      avatar: 'nanoid',
    },
  }
  const out = generate(
    `
export type Private<T> = T & { readonly __classification__?: 'private' }

export interface User {
  email: ColumnType<Private<string>, string, string>
  website: string | null
  phone: ColumnType<Private<string> | null, string | null, string | null>
  avatar: Generated<string>
  bio: string
}
`,
    formats
  )

  assert.match(out, /email: z\.email\(\),/)
  // Nullable + format → validator first, then .nullable().
  assert.match(out, /website: z\.url\(\)\.nullable\(\),/)
  assert.match(out, /phone: z\.e164\(\)\.nullable\(\),/)
  // Format applies to the row schema; insert-optionality is independent.
  const insert = out.slice(out.indexOf('UserInsertZ'))
  assert.match(insert, /avatar: z\.nanoid\(\)\.optional\(\),/)
  // Unformatted string stays plain.
  assert.match(out, /bio: z\.string\(\),/)
})
