import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TypesMap } from '@pikku/inspector/lite'
import { serializeSdkSources } from './addon-sdk-sources.js'
import {
  buildSdkFiles,
  pruneTypesMap,
  SDK_AGENT_MAP,
  SDK_RPC_MAP,
  SDK_WORKFLOW_MAP,
} from './addon-sdk.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as any

/**
 * An addon with one remote function and one exposed workflow on its surface,
 * and an internal function and workflow that are not — the internal ones typed
 * with a source interface, so a leak would also make the SDK import src/.
 */
const addonState = () => {
  const typesMap = new TypesMap()
  typesMap.addCustomType('NoteRow', '{ id: string; body: string }', [])
  typesMap.addCustomType('ListNotesOutput', 'Array<NoteRow>', [])
  typesMap.addCustomType('PublishNoteInput', '{ noteId: string }', [])
  typesMap.addCustomType('IngestPackageInput', '{ tarball: string }', [])
  typesMap.addType('IngestPackageOutput', '/addon/src/ingest.ts')
  typesMap.addCustomType('EnrichCatalogueInput', '{ since: string }', [])
  return {
    functions: {
      typesMap,
      meta: {
        listNotes: { pikkuFuncId: 'listNotes', remote: true },
        ingestPackage: {
          pikkuFuncId: 'ingestPackage',
          inputs: ['IngestPackageInput'],
          outputs: ['IngestPackageOutput'],
        },
        publishNoteWorkflow: {
          pikkuFuncId: 'publishNoteWorkflow',
          inputs: ['PublishNoteInput'],
          outputs: [],
        },
        enrichCatalogueWorkflow: {
          pikkuFuncId: 'enrichCatalogueWorkflow',
          inputs: ['EnrichCatalogueInput'],
          outputs: [],
        },
      },
    },
    rpc: { remoteMeta: { listNotes: 'listNotes' } },
    resolvedIOTypes: {
      listNotes: { inputType: 'null', outputType: 'ListNotesOutput' },
      ingestPackage: {
        inputType: 'IngestPackageInput',
        outputType: 'IngestPackageOutput',
      },
    },
    workflows: {
      meta: {
        publishNote: {
          name: 'publishNote',
          pikkuFuncId: 'publishNoteWorkflow',
          steps: [],
          expose: true,
        },
        enrichCatalogue: {
          name: 'enrichCatalogue',
          pikkuFuncId: 'enrichCatalogueWorkflow',
          steps: [],
        },
      },
    },
  } as any
}

const OUT = '/addon/.pikku/addon'
const paths = (root: string) => ({
  packageMappings: {},
  rpcRemoteMapDeclarationFile: `${OUT}/rpc/pikku-rpc-wirings-map.remote.gen.d.ts`,
  workflowMapDeclarationFile: `${OUT}/workflow/pikku-workflow-map.gen.d.ts`,
  agentMapDeclarationFile: `${OUT}/agent/pikku-agent-map.gen.d.ts`,
  customTypesDeclarationFile: `${OUT}/pikku-custom-types.gen.d.ts`,
  functionsMetaJsonFile: join(root, 'pikku-functions-meta.gen.json'),
  schemaDirectory: join(root, 'schemas'),
})

const INTERNAL = [
  'IngestPackageInput',
  'IngestPackageOutput',
  'EnrichCatalogueInput',
  'enrichCatalogue',
  'src/ingest',
]

describe('serializeSdkSources', () => {
  test('ships the remote and exposed surface and nothing internal', () => {
    const root = mkdtempSync(join(tmpdir(), 'pikku-sdk-sources-'))
    try {
      mkdirSync(join(root, 'schemas'))
      writeFileSync(
        join(root, 'pikku-functions-meta.gen.json'),
        JSON.stringify(addonState().functions.meta)
      )
      const { files } = buildSdkFiles(
        serializeSdkSources(logger, addonState(), paths(root)),
        { name: '@acme/notes', version: '1.0.0', pikkuCore: '^0.12.0' }
      )
      const rpcMap = files.get(SDK_RPC_MAP)!
      const workflowMap = files.get(SDK_WORKFLOW_MAP)!
      const agentMap = files.get(SDK_AGENT_MAP)!

      assert.match(
        rpcMap,
        /readonly 'listNotes': RPCHandler<null, ListNotesOutput>/
      )
      assert.match(rpcMap, /export type NoteRow = /)
      assert.match(workflowMap, /"publishNote"/)
      for (const [file, content] of [
        [SDK_RPC_MAP, rpcMap],
        [SDK_WORKFLOW_MAP, workflowMap],
        [SDK_AGENT_MAP, agentMap],
      ]) {
        for (const internal of INTERNAL) {
          assert.ok(
            !content!.includes(internal),
            `${file} leaks ${internal}:\n${content}`
          )
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('a versioned remote function is callable as fn and as each fn@vN', () => {
    const state = addonState()
    state.rpc.remoteMeta = {
      listNotes: 'listNotes@v2',
      'listNotes@v1': 'listNotes@v1',
      'listNotes@v2': 'listNotes@v2',
    }
    state.resolvedIOTypes['listNotes@v1'] = {
      inputType: 'null',
      outputType: 'NoteRow',
    }
    state.resolvedIOTypes['listNotes@v2'] = {
      inputType: 'null',
      outputType: 'ListNotesOutput',
    }
    const rpcMap = serializeSdkSources(logger, state, paths('/unused')).rpcMap
      .content
    assert.match(
      rpcMap,
      /readonly 'listNotes': RPCHandler<null, ListNotesOutput>/
    )
    assert.match(rpcMap, /readonly 'listNotes@v1': RPCHandler<null, NoteRow>/)
    assert.match(
      rpcMap,
      /readonly 'listNotes@v2': RPCHandler<null, ListNotesOutput>/
    )
  })
})

test('pruneTypesMap follows custom types to what they reference', () => {
  const pruned = pruneTypesMap(addonState().functions.typesMap, [
    'ListNotesOutput',
  ])
  assert.deepEqual([...pruned.customTypes.keys()].sort(), [
    'ListNotesOutput',
    'NoteRow',
  ])
  assert.throws(() => pruned.getTypeMeta('IngestPackageOutput'))
})
