import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeAuthGuards } from './serialize-auth-guards.js'

const emit = () =>
  serializeAuthGuards(
    '../function/pikku-function-types.gen.js',
    "import type { RequiredSingletonServices } from '../pikku-services.gen.js'",
    'my-addon'
  )

describe('serializeAuthGuards', () => {
  // Who may call a function is a decision taken once and reused across wirings,
  // and it used to be taken on the function leaf — next to the definers, as if
  // writing a function and deciding who reaches it were the same act. They are
  // one import now, and it is the one named after what it does.
  test('every way to gate a call is on one leaf', () => {
    const content = emit()

    for (const name of [
      'PikkuPermission',
      'pikkuPermission',
      'pikkuPermissionFactory',
      'pikkuAuth',
      'addGlobalPermission',
    ]) {
      assert.match(
        content,
        new RegExp(`export (const|type) ${name}\\b`),
        `expected the auth leaf to declare '${name}'`
      )
    }
  })

  // A credential is what a call is made *with*, so it belongs with the gates
  // rather than beside the typed credential map it has nothing to do with.
  test('declaring a credential lands here too', () => {
    assert.match(
      emit(),
      /export \{ defineCredential \} from '@pikku\/core\/credential'/
    )
  })

  // Re-implementing core's `pikkuAuth` would let the generated copy drift from
  // the shape the permission runner actually evaluates.
  test('pikkuAuth delegates to core rather than re-implementing it', () => {
    const content = emit()

    assert.match(
      content,
      /import \{ pikkuAuth as pikkuAuthCore \} from '@pikku\/core\/function'/
    )
    assert.match(content, /pikkuAuthCore\(auth as any\)/)
  })

  // Namespaced so an addon's global permission is attributed to the addon
  // rather than to the host that installed it.
  test('the global registration carries the package name', () => {
    assert.match(
      emit(),
      /addGlobalPermissionCore\(permissions as any, 'my-addon'\)/
    )
  })

  test('types against the function leaf without importing a value from it', () => {
    assert.match(
      emit(),
      /import type \{[^}]*WiredServices,?[^}]*\} from '\.\.\/function\/pikku-function-types\.gen\.js'/s
    )
  })

  // `WiredSingletonServices` is named by no `.d.ts` outside the leaves that
  // declare it, so the function leaf keeps it private and this leaf derives its
  // own. `WiredServices` is named by 147 of them and stays imported.
  test('derives the wired singleton intersection rather than importing it', () => {
    const content = emit()

    assert.match(
      content,
      /import type \{ RequiredSingletonServices \} from '\.\.\/pikku-services\.gen\.js'/
    )
    assert.match(
      content,
      /^type WiredSingletonServices = RequiredSingletonServices & SingletonServices$/m
    )
    assert.doesNotMatch(
      content,
      /import type \{[^}]*WiredSingletonServices[^}]*\} from/s
    )
  })
})
