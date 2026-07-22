import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateEnumsSource, parseDbEnums } from './generate-enums.js'

const ENUMS_GEN = `// AUTO-GENERATED
export type ParticipantDietaryTag = 'omnivore' | 'vegetarian' | 'vegan'
export type BookingStatus = 'enquiry' | 'reserved' | 'confirmed'
export type AuditLogAction = 'create' | 'update' | 'delete'
export {}
`

test('parseDbEnums reads the union members of each exported type', () => {
  const enums = parseDbEnums(ENUMS_GEN)
  const byName = Object.fromEntries(enums.map((e) => [e.name, e.members]))
  assert.deepEqual(byName.ParticipantDietaryTag, [
    'omnivore',
    'vegetarian',
    'vegan',
  ])
  assert.deepEqual(byName.BookingStatus, ['enquiry', 'reserved', 'confirmed'])
  assert.deepEqual(byName.AuditLogAction, ['create', 'update', 'delete'])
})

test('an exact value-set match types the group against the DB enum', () => {
  const keys = [
    'enum__dietary__omnivore',
    'enum__dietary__vegetarian',
    'enum__dietary__vegan',
  ]
  const src = generateEnumsSource(keys, {
    dbEnums: parseDbEnums(ENUMS_GEN),
    enumsImport: '#pikku/db/enums.gen',
    unmatchedDbEnums: 'warn', // isolate the exact-match path
  })
  // typed against the DB enum, not the catalog union
  assert.match(
    src,
    /export const dietary = \{[\s\S]*?\} satisfies EnumLabel<ParticipantDietaryTag>/
  )
  // imports only the type it actually used
  assert.match(
    src,
    /import type \{ ParticipantDietaryTag \} from '#pikku\/db\/enums\.gen'/
  )
  assert.match(
    src,
    /export type EnumLabel<E extends string> = Record<E, I18nMessage>/
  )
  // no deprecated alias — this is a new feature
  assert.doesNotMatch(src, /EnumI18n/)
})

test('a non-DB group (no overlap) stays catalog-typed and warns nothing', () => {
  const warnings: string[] = []
  const keys = [
    'enum__email_kind__send_welcome',
    'enum__email_kind__send_receipt',
  ]
  const src = generateEnumsSource(keys, {
    dbEnums: parseDbEnums(ENUMS_GEN),
    enumsImport: '#pikku/db/enums.gen',
    onWarn: (m) => warnings.push(m),
  })
  assert.match(
    src,
    /export const emailKind = \{[\s\S]*?\} satisfies EnumLabel<"send_welcome" \| "send_receipt">/
  )
  assert.equal(
    warnings.some((w) => w.includes('email_kind')),
    false
  )
})

test('a group with an extra member warns about catalog/DB drift', () => {
  const warnings: string[] = []
  // booking_status group has an extra 'cancelled' not in the DB enum
  const keys = [
    'enum__booking_status__enquiry',
    'enum__booking_status__reserved',
    'enum__booking_status__confirmed',
    'enum__booking_status__cancelled',
  ]
  generateEnumsSource(keys, {
    dbEnums: parseDbEnums(ENUMS_GEN),
    enumsImport: '#pikku/db/enums.gen',
    onWarn: (m) => warnings.push(m),
  })
  const drift = warnings.find(
    (w) => w.includes("'booking_status'") && w.includes('BookingStatus')
  )
  assert.ok(drift, `expected a drift warning, got: ${warnings.join(' | ')}`)
  assert.match(drift!, /extra member\(s\) not in DB: cancelled/)
})

test("an unmatched DB enum emits a label map referencing default keys ('emit')", () => {
  const warnings: string[] = []
  const keys = [
    'enum__dietary__omnivore',
    'enum__dietary__vegetarian',
    'enum__dietary__vegan',
    'enum__booking_status__enquiry',
    'enum__booking_status__reserved',
    'enum__booking_status__confirmed',
  ]
  const src = generateEnumsSource(keys, {
    dbEnums: parseDbEnums(ENUMS_GEN),
    enumsImport: '#pikku/db/enums.gen',
    onWarn: (m) => warnings.push(m),
  })
  // AuditLogAction has no group → orphan const named by the enum
  assert.match(
    src,
    /export const auditLogAction = \{[\s\S]*?\} satisfies EnumLabel<AuditLogAction>/
  )
  assert.match(src, /create: m\.enum__audit_log_action__create,/)
  assert.match(
    src,
    /import type \{ AuditLogAction, BookingStatus, ParticipantDietaryTag \} from/
  )
  assert.ok(
    warnings.some(
      (w) =>
        w.includes('AuditLogAction') &&
        w.includes('enum__audit_log_action__create')
    )
  )
})

test("unmatchedDbEnums: 'warn' reports the orphan but emits no const", () => {
  const warnings: string[] = []
  const keys = [
    'enum__dietary__omnivore',
    'enum__dietary__vegetarian',
    'enum__dietary__vegan',
  ]
  const src = generateEnumsSource(keys, {
    dbEnums: parseDbEnums(ENUMS_GEN),
    enumsImport: '#pikku/db/enums.gen',
    unmatchedDbEnums: 'warn',
    onWarn: (m) => warnings.push(m),
  })
  assert.doesNotMatch(src, /auditLogAction/)
  assert.ok(warnings.some((w) => w.includes('AuditLogAction')))
})

test('with no dbEnums the output is purely catalog-typed (back-compat)', () => {
  const keys = ['enum__dietary__omnivore', 'enum__dietary__vegan']
  const src = generateEnumsSource(keys)
  assert.match(src, /satisfies EnumLabel<"omnivore" \| "vegan">/)
  // only the I18nString brand is imported — no DB enums module
  assert.doesNotMatch(src, /enums\.gen/)
  assert.match(src, /import type \{ I18nString \} from '@pikku\/react'/)
})
