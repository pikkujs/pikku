import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PikkuError,
  declareErrorNames,
  getDeclaredErrorName,
} from './error-handler.js'
import * as errors from './errors.js'
import * as workflowErrors from '../wirings/workflow/workflow-errors.js'
import * as rpcErrors from '../wirings/rpc/rpc-runner.js'
import * as queueErrors from '../wirings/queue/queue-runner.js'
import * as addonErrors from '../wirings/addon/remote-addon-auth.js'

test('a declared name survives a renamed constructor', () => {
  // What a deploy bundle does: the class keeps working, its identifier does
  // not survive. Before the name was declared, this instance answered `cn`.
  const cn = class extends PikkuError {}
  assert.notEqual(cn.name, 'PermissionDeniedError')
  declareErrorNames({ PermissionDeniedError: cn })
  assert.equal(new cn('Permission denied').name, 'PermissionDeniedError')
})

test('an undeclared error still falls back to its constructor name', () => {
  class AppSpecificError extends PikkuError {}
  assert.equal(new AppSpecificError().name, 'AppSpecificError')
})

test('a subclass of a declared error does not inherit its name', () => {
  const parent = class extends PikkuError {}
  declareErrorNames({ ParentError: parent })
  class ChildError extends parent {}
  assert.equal(new ChildError().name, 'ChildError')
})

const isPikkuErrorClass = (value: unknown): value is Function =>
  typeof value === 'function' && value.prototype instanceof PikkuError

for (const [module, namespace] of Object.entries({
  errors,
  workflowErrors,
  rpcErrors,
  queueErrors,
  addonErrors,
})) {
  test(`every error exported from ${module} declares its own name`, () => {
    const undeclared: string[] = []
    for (const [exported, value] of Object.entries(namespace)) {
      if (!isPikkuErrorClass(value)) continue
      if (getDeclaredErrorName(value) !== exported) undeclared.push(exported)
    }
    assert.deepEqual(
      undeclared,
      [],
      `these ship as a minified identifier on the wire: ${undeclared.join(', ')}`
    )
  })
}
