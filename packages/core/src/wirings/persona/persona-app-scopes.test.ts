import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  appScopeId,
  buildAppScopeDefinition,
  declaredApps,
} from './persona-app-scopes.js'

const persona = (id: string, app?: string) =>
  ({ id, name: id, roles: [], goals: [], tags: [], runnable: true, app }) as any

describe('declaredApps', () => {
  test('deduplicates and sorts the apps the personas name', () => {
    assert.deepEqual(
      declaredApps([
        persona('a', 'staff'),
        persona('b', 'portal'),
        persona('c', 'staff'),
      ]),
      ['portal', 'staff']
    )
  })

  test('ignores personas that name no app', () => {
    assert.deepEqual(declaredApps([persona('a'), persona('b', '')]), [])
  })
})

describe('buildAppScopeDefinition', () => {
  test('renders one grantable child per app under the app root', () => {
    const definition = buildAppScopeDefinition([
      persona('a', 'staff'),
      persona('b', 'portal'),
    ])

    assert.equal(definition?.name, 'app')
    assert.deepEqual(Object.keys(definition?.scopes ?? {}).sort(), [
      'portal',
      'staff',
    ])
    assert.equal(appScopeId('staff'), 'app:staff')
  })

  test('is null for a single-frontend product', () => {
    assert.equal(buildAppScopeDefinition([persona('a')]), null)
  })
})
