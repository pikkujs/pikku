import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  filterInternalRPCMeta,
  remoteAddonDefaultVersions,
} from './pikku-command-rpc.js'
import { withoutScenarios } from '../scenarios/scenario-partition.js'

describe('filterInternalRPCMeta', () => {
  test('keeps unversioned aliases when the target versioned function survives', () => {
    const result = filterInternalRPCMeta(
      {
        listCards: 'listCards@v2',
        'listCards@v2': 'listCards@v2',
        createCard: 'createCard@v2',
        'createCard@v2': 'createCard@v2',
        missingAlias: 'missing@v2',
      },
      {
        'listCards@v2': {},
        'createCard@v2': {},
      }
    )

    assert.deepEqual(result, {
      listCards: 'listCards@v2',
      'listCards@v2': 'listCards@v2',
      createCard: 'createCard@v2',
      'createCard@v2': 'createCard@v2',
    })
  })

  test('drops scenarios, steps and their aliases from the emitted internal meta', () => {
    // What `pikkuRPC` writes: the internal meta filtered against the app's own
    // functions. A scenario name here is a name a deployed bundle carries and, in
    // principle, dispatches.
    const functionsMeta = {
      createCard: { pikkuFuncId: 'createCard' },
      loginScenario: { pikkuFuncId: 'loginScenario', scenario: true },
      'loginScenario@v2': { pikkuFuncId: 'loginScenario@v2', scenario: true },
      opensPage: { pikkuFuncId: 'opensPage', scenarioStep: true },
    } as never

    const result = filterInternalRPCMeta(
      {
        createCard: 'createCard',
        loginScenario: 'loginScenario@v2',
        'loginScenario@v2': 'loginScenario@v2',
        opensPage: 'opensPage',
      },
      withoutScenarios(functionsMeta)
    )

    assert.deepEqual(result, { createCard: 'createCard' })
  })
})

describe('remoteAddonDefaultVersions', () => {
  test("maps each remote addon's base names to its SDK's latest version, by package", () => {
    const result = remoteAddonDefaultVersions({
      rpc: {
        wireAddonDeclarations: new Map([
          ['notes', { package: '@acme/notes', remote: true }],
          ['local', { package: '@acme/local' }],
          ['unlocked', { package: '@acme/unlocked', remote: true }],
        ]),
      },
      remoteAddonFunctions: {
        notes: {
          'listNotes@v1': { versions: [1, 2], latestVersion: 2 },
          'listNotes@v2': { versions: [1, 2], latestVersion: 2 },
          renameNote: { versions: [1], latestVersion: 1 },
        },
        local: { other: { versions: [1], latestVersion: 1 } },
      },
    } as never)

    assert.deepEqual(result, {
      '@acme/notes': {
        listNotes: 'listNotes@v2',
        renameNote: 'renameNote@v1',
      },
    })
  })

  test('an SDK cut before versions were packed adds nothing', () => {
    assert.deepEqual(
      remoteAddonDefaultVersions({
        rpc: {
          wireAddonDeclarations: new Map([
            ['notes', { package: '@acme/notes', remote: true }],
          ]),
        },
        remoteAddonFunctions: { notes: { listNotes: {} } },
      } as never),
      {}
    )
  })
})
