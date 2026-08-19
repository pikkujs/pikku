import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializePublicRPC } from './rpc/serialize-public-rpc.js'
import { serializePublicAgent } from './agent/serialize-public-agent.js'
import { serializeWorkflowRoutes } from './workflow/serialize-workflow-routes.js'
import { serializeEventsScaffold } from './realtime/serialize-events-scaffold.js'
import { serializeUserAdminFunctions } from './user-admin/serialize-user-admin-functions.js'
import { serializeVirtualUserFunctions } from './virtual-user/serialize-virtual-user-functions.js'

const leaf = (name: string) => `#pikku/${name}`

const authFields = (output: string) =>
  output.match(/^\s*auth: (true|false),?$/gm)?.map((line) => line.trim()) ?? []

describe('the scaffold dispatchers decline to gate', () => {
  const dispatchers: Array<[string, string]> = [
    ['public rpc', serializePublicRPC(leaf).functions],
    ['public agent', serializePublicAgent(leaf).functions],
    ['workflow routes', serializeWorkflowRoutes(leaf).functions],
    ['events channel', serializeEventsScaffold(leaf).functions],
  ]

  for (const [name, output] of dispatchers) {
    test(name, () => {
      const fields = authFields(output)
      assert.notEqual(
        fields.length,
        0,
        `${name} emits no auth field at all, so its wiring defaults to requiring a session`
      )
      assert.deepEqual(
        [...new Set(fields)],
        ['auth: false,'],
        `${name} gates the call itself instead of leaving it to the function it forwards to`
      )
    })
  }
})

describe('the scoped admin surfaces emit no auth field', () => {
  const surfaces: Array<[string, string]> = [
    ['user admin', serializeUserAdminFunctions(leaf).functions],
    [
      'virtual user',
      serializeVirtualUserFunctions(leaf, '#personas').functions,
    ],
  ]

  for (const [name, output] of surfaces) {
    test(name, () => {
      assert.deepEqual(
        authFields(output),
        [],
        `${name} emits an auth field on a session-requiring function`
      )
    })
  }
})
