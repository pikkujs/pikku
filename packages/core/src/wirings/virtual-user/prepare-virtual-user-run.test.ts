import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  personaScopes,
  prepareVirtualUserRun,
} from './prepare-virtual-user-run.js'

const ROLE_DEFINITIONS = [
  { name: 'editor', scopes: ['docs:write', 'docs:read'] },
  { name: 'viewer', scopes: ['docs:read'] },
]

const FUNCTIONS_META = {
  listDocs: { pikkuFuncName: 'listDocs', services: [], expose: true },
  deleteDoc: { pikkuFuncName: 'deleteDoc', services: [], expose: true },
} as any

describe('personaScopes', () => {
  test('expands the roles a persona declares into the scopes functions check', () => {
    const scopes = personaScopes(
      { roles: ['editor'] },
      {
        editor: ['docs:write', 'docs:read'],
      }
    )
    assert.deepEqual(scopes, ['docs:read', 'docs:write'])
  })

  test('a persona with no roles holds no scopes', () => {
    assert.deepEqual(personaScopes({}, { editor: ['docs:write'] }), [])
  })

  // Two roles granting the same scope is ordinary, and the catalogue narrowing
  // downstream compares scopes as a set.
  test('de-duplicates overlapping roles', () => {
    const scopes = personaScopes(
      { roles: ['editor', 'viewer'] },
      {
        editor: ['docs:write', 'docs:read'],
        viewer: ['docs:read'],
      }
    )
    assert.deepEqual(scopes, ['docs:read', 'docs:write'])
  })

  // An undeclared role granting everything would be the worst possible default.
  test('an unknown role grants nothing', () => {
    assert.deepEqual(personaScopes({ roles: ['ghost'] }, {}), [])
  })
})

describe('prepareVirtualUserRun', () => {
  // The CLI reads the inspector state, which holds an array; the scaffolded RPC
  // reads metaService, which hands the same definitions back keyed by name. Both
  // callers must land on the same scopes or the same persona and seed explore a
  // different API depending on how the run was started.
  test('accepts role definitions as an array or keyed by name, identically', () => {
    const asArray = prepareVirtualUserRun({
      persona: { roles: ['editor'] },
      functionsMeta: FUNCTIONS_META,
      systemRoles: ROLE_DEFINITIONS as any,
    })
    const asRecord = prepareVirtualUserRun({
      persona: { roles: ['editor'] },
      functionsMeta: FUNCTIONS_META,
      systemRoles: {
        editor: ROLE_DEFINITIONS[0],
        viewer: ROLE_DEFINITIONS[1],
      } as any,
    })
    assert.deepEqual(asArray.scopes, asRecord.scopes)
    assert.deepEqual(asArray.scopes, ['docs:read', 'docs:write'])
  })

  test('derives the catalogue from the function meta', () => {
    const { catalogue } = prepareVirtualUserRun({
      persona: {},
      functionsMeta: FUNCTIONS_META,
    })
    assert.deepEqual(catalogue.map((entry) => entry.name).sort(), [
      'deleteDoc',
      'listDocs',
    ])
  })

  // An agent is reached rather than declared: its scopes are checked against the
  // session, so a persona must find the specialists its roles unlock and no
  // others.
  test('narrows agents to the ones the persona s scopes reach', () => {
    const agentsMeta = {
      helper: { scopes: [] },
      auditor: { scopes: ['docs:audit'] },
    } as any

    const { agents } = prepareVirtualUserRun({
      persona: { roles: ['viewer'] },
      functionsMeta: FUNCTIONS_META,
      systemRoles: ROLE_DEFINITIONS as any,
      agentsMeta,
    })

    assert.deepEqual(
      agents.map((agent) => agent.name),
      ['helper']
    )
  })

  test('a project with no scenarios simply has no intents', () => {
    const { intents } = prepareVirtualUserRun({
      persona: {},
      functionsMeta: FUNCTIONS_META,
    })
    assert.deepEqual(intents, [])
  })
})
