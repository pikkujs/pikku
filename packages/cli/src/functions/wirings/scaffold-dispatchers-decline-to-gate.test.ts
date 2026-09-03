import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializePublicRPC } from './rpc/serialize-public-rpc.js'
import { serializePublicAgent } from './agent/serialize-public-agent.js'
import { serializeWorkflowRoutes } from './workflow/serialize-workflow-routes.js'
import { serializeEventsScaffold } from './realtime/serialize-events-scaffold.js'
import { serializeVirtualUserFunctions } from './virtual-user/serialize-virtual-user-functions.js'

const leaf = (name: string) => `#pikku/${name}`

const declarations = (output: string) =>
  output.split(/\n(?=export const |wire[A-Z])/)

const isExposed = (declaration: string) =>
  /^\s*expose: true,?$/m.test(declaration)

const authFields = (output: string) =>
  output.match(/^\s*auth: (true|false),?$/gm)?.map((line) => line.trim()) ?? []

const forwardedAuthFields = (output: string) =>
  declarations(output)
    .filter((declaration) => !isExposed(declaration))
    .flatMap(authFields)

describe('the scaffold dispatchers decline to gate', () => {
  const dispatchers: Array<[string, string]> = [
    ['public rpc', serializePublicRPC(leaf).functions],
    ['public agent', serializePublicAgent(leaf).functions],
    ['workflow routes', serializeWorkflowRoutes(leaf).functions],
    ['events channel', serializeEventsScaffold(leaf).functions],
  ]

  for (const [name, output] of dispatchers) {
    test(name, () => {
      const fields = forwardedAuthFields(output)
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

describe('the exposed scaffold functions gate themselves', () => {
  const surfaces: Array<[string, string]> = [
    ['public agent', serializePublicAgent(leaf).functions],
  ]

  for (const [name, output] of surfaces) {
    const exposed = declarations(output).filter(isExposed)

    test(name, () => {
      assert.notEqual(exposed.length, 0, `${name} exposes no function at all`)
      for (const declaration of exposed) {
        const funcName = declaration.match(/export const (\w+)/)?.[1]
        assert.ok(
          /^\s*auth: true,?$/m.test(declaration) ||
            /^\s*permissions: /m.test(declaration),
          `${funcName} is exposed with neither a session requirement nor a permission, so PKU574 fires on every project that scaffolds it`
        )
      }
    })
  }
})

describe('the scoped admin surfaces emit no auth field', () => {
  const surfaces: Array<[string, string]> = [
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
