import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  catalogueClassification,
  catalogueIndex,
  describeEntry,
  isReadOnly,
  reachableCatalogue,
  renderCatalogue,
} from './virtual-user-catalogue.js'
import type { ApiCatalogueEntry } from './virtual-user.types.js'

const entry = (
  name: string,
  extra: Partial<ApiCatalogueEntry> = {}
): ApiCatalogueEntry => ({ name, ...extra })

describe('read/write classification', () => {
  test('an explicit annotation always wins over the name', () => {
    assert.equal(isReadOnly(entry('getProject', { readonly: false })), false)
    assert.equal(isReadOnly(entry('deleteProject', { readonly: true })), true)
  })

  test('without one, the name decides', () => {
    for (const name of [
      'getProject',
      'listProjects',
      'searchUsers',
      'findOrg',
      'countDeployments',
      'isMember',
      'hasAccess',
    ]) {
      assert.equal(isReadOnly(entry(name)), true, name)
    }
    for (const name of [
      'createProject',
      'deployStage',
      'inviteMember',
      'rollbackDeployment',
      'updateOrg',
    ]) {
      assert.equal(isReadOnly(entry(name)), false, name)
    }
  })

  test('a read prefix only counts on a word boundary', () => {
    // 'checkoutCart' starts with 'check' but is emphatically not a read.
    assert.equal(isReadOnly(entry('checkoutCart')), false)
    assert.equal(isReadOnly(entry('issueRefund')), false)
    assert.equal(isReadOnly(entry('countersignContract')), false)
  })

  test('how much of the split is guess is reported rather than hidden', () => {
    const classification = catalogueClassification([
      entry('getProject', { readonly: true }),
      entry('createProject', { readonly: false }),
      entry('deployStage'),
      entry('listStages'),
    ])
    assert.deepEqual(classification, { total: 4, annotated: 2, inferred: 2 })
  })
})

describe('catalogue rendering', () => {
  test('an entry renders as name(inputs) -> outputs — description', () => {
    const rendered = renderCatalogue([
      entry('createProject', {
        inputKeys: ['name', 'orgId'],
        outputKeys: ['projectId'],
        description: 'Create a project',
      }),
    ])
    assert.equal(
      rendered,
      'createProject(name,orgId) -> projectId — Create a project'
    )
  })

  test('missing meta degrades quietly instead of rendering undefined', () => {
    assert.equal(renderCatalogue([entry('ping')]), 'ping()')
  })

  test('only the first line of a description is used', () => {
    const rendered = renderCatalogue([
      entry('getOrg', { description: 'Read an org.\nWith more detail below.' }),
    ])
    assert.equal(rendered, 'getOrg() — Read an org.')
  })

  test('every reachable endpoint is listed — nothing is ranked away', () => {
    const entries = Array.from({ length: 50 }, (_, i) => entry(`getThing${i}`))
    assert.equal(renderCatalogue(entries).split('\n').length, 50)
  })
})

describe('what a given user is offered', () => {
  const entries = [
    entry('getProject'),
    entry('createProject'),
    entry('deployStage', { approvalRequired: true }),
    entry('listOrgs', { permissions: ['requiresPlatformAdmin'] }),
    entry('getOrgMembers', { permissions: ['canAccessOrgById'] }),
  ]

  test('approval-gated calls are withheld by default', () => {
    const names = reachableCatalogue(entries).map((e) => e.name)
    assert.ok(!names.includes('deployStage'))
  })

  test('and offered when the run opts in', () => {
    const names = reachableCatalogue(entries, {
      allowApprovalRequired: true,
    }).map((e) => e.name)
    assert.ok(names.includes('deployStage'))
  })

  test('a read-only user is offered no mutations at all', () => {
    const names = reachableCatalogue(entries, { readOnly: true }).map(
      (e) => e.name
    )
    assert.deepEqual(names, ['getProject', 'listOrgs', 'getOrgMembers'])
  })

  test('a tier the actor cannot satisfy is left out', () => {
    const names = reachableCatalogue(entries, {
      grants: ['canAccessOrgById'],
    }).map((e) => e.name)
    assert.deepEqual(names, ['getProject', 'createProject', 'getOrgMembers'])
  })

  test('omitting grants keeps everything — narrowing is opt-in', () => {
    assert.equal(
      reachableCatalogue(entries, { allowApprovalRequired: true }).length,
      5
    )
  })
})

describe('describing an endpoint before calling it', () => {
  test('hands back the full input schema, not just the key names', () => {
    const described = describeEntry(
      entry('createProject', {
        description: 'Create a project',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        outputSchema: { type: 'object', properties: { projectId: {} } },
      })
    )
    assert.equal(described.name, 'createProject')
    assert.equal(described.readonly, false)
    assert.equal(described.approvalRequired, false)
    assert.deepEqual(described.input, {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    })
    assert.ok(described.output)
  })

  test('an endpoint with no schema still describes as callable with nothing', () => {
    const described = describeEntry(entry('ping'))
    assert.deepEqual(described.input, { type: 'object', properties: {} })
    assert.equal(described.output, null)
  })
})

describe('catalogue index', () => {
  test('looks endpoints up by name', () => {
    const index = catalogueIndex([entry('getProject'), entry('createProject')])
    assert.equal(index.get('getProject')?.name, 'getProject')
    assert.equal(index.get('nonsense'), undefined)
  })
})
