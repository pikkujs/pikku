/**
 * Verifies that a `.default()` in a declaration is a value at runtime.
 *
 * The schema reaches `TypedVariablesService` through the generated metadata, so
 * this only passes if code generation carried the schema across as a value —
 * which is the half that is easy to lose.
 */
import assert from 'node:assert/strict'
import { LocalVariablesService } from '@pikku/core/services'
import { TypedVariablesService } from '#pikku/variables'

const unset = new TypedVariablesService(new LocalVariablesService({}))

assert.equal(await unset.get('API_BASE_URL'), 'https://api.example.com')
console.log('✓ a declared default answers a variable nobody set')

assert.equal(await unset.get('SERVER_CONFIG'), undefined)
console.log('✓ a declaration with no default still resolves to undefined')

const missing = await unset.getMissing()
assert.deepEqual(
  missing.map((v) => v.variableId),
  ['SERVER_CONFIG']
)
console.log('✓ a defaulted variable is not something the host must supply')

const configured = new TypedVariablesService(
  new LocalVariablesService({ API_BASE_URL: 'https://api.example.com' })
)
assert.equal(await configured.get('API_BASE_URL'), 'https://api.example.com')
console.log('✓ a host value is taken over the default')
