import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  buildSdkFiles,
  listImportSpecifiers,
  rewriteSdkFile,
  SdkImportError,
  sdkTarballName,
  SDK_AGENT_MAP,
  SDK_FUNCTIONS_META,
  SDK_MANIFEST,
  SDK_RPC_MAP,
  SDK_WORKFLOW_MAP,
  sdkDefaultVersions,
} from './addon-sdk.js'
import { packTarGz } from './sdk-tarball.js'
import { readTgz } from './extract-tgz.js'

const RPC_MAP = [
  "import type * as __PikkuCustomTypes from '../pikku-custom-types.gen.d.js'",
  'export type ListNotesOutput = __PikkuCustomTypes.ListNotesOutput',
  'export type RPCMap = {',
  "  readonly 'listNotes': RPCHandler<null, ListNotesOutput>,",
  '}',
  "import type { FlattenedWorkflowMap } from '../workflow/pikku-workflow-map.gen.d.js'",
  "import type { AgentMap } from '../agent/pikku-agent-map.gen.d.js'",
  "import type { PikkuRPC } from '@pikku/core/rpc'",
  '',
].join('\n')

const CUSTOM_TYPES = [
  "import type { MCPToolResponse } from '@pikku/core/mcp'",
  'export type ListNotesOutput = { id: string; body: string }[]',
  '',
].join('\n')

/** An addon's `.pikku/addon` tree, as `pikku all` leaves it. */
const withAddonOutput = (
  overrides: {
    rpcMap?: string
    meta?: Record<string, { remote?: boolean }>
    /** The functions the maps declare; the remote ones when not given. */
    contract?: string[]
  },
  run: (sources: Parameters<typeof buildSdkFiles>[0], root: string) => void
) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-sdk-'))
  const out = join(root, '.pikku', 'addon')
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(out, path)), { recursive: true })
    writeFileSync(join(out, path), content)
  }
  write(
    'rpc/pikku-rpc-wirings-map.remote.gen.d.ts',
    overrides.rpcMap ?? RPC_MAP
  )
  write(
    'workflow/pikku-workflow-map.gen.d.ts',
    'export type FlattenedWorkflowMap = {}\n'
  )
  write('agent/pikku-agent-map.gen.d.ts', 'export type AgentMap = {}\n')
  write('pikku-custom-types.gen.d.ts', CUSTOM_TYPES)
  write(
    'schemas/schemas/ListNotesOutput.schema.json',
    JSON.stringify({ type: 'array' })
  )
  const meta = overrides.meta ?? {
    listNotes: { remote: true, inputs: [], outputs: ['ListNotesOutput'] },
    // Exposed but not remote: a remote-addon caller is refused it.
    renameNote: { expose: true, inputs: [], outputs: [] },
    publishNoteWorkflow: { inputs: [], outputs: [] },
    internalOnly: { inputs: [], outputs: [] },
  }
  write('function/pikku-functions-meta.gen.json', JSON.stringify(meta))
  try {
    const declaration = (path: string) => ({
      path: join(out, path),
      content: readFileSync(join(out, path), 'utf-8'),
    })
    run(
      {
        rpcMap: declaration('rpc/pikku-rpc-wirings-map.remote.gen.d.ts'),
        workflowMap: declaration('workflow/pikku-workflow-map.gen.d.ts'),
        agentMap: declaration('agent/pikku-agent-map.gen.d.ts'),
        customTypes: declaration('pikku-custom-types.gen.d.ts'),
        functionsMeta: join(out, 'function/pikku-functions-meta.gen.json'),
        schemaDirectory: join(out, 'schemas'),
        contractFunctionIds:
          overrides.contract ??
          (overrides.meta
            ? Object.keys(meta).filter((id) => meta[id]!.remote === true)
            : ['listNotes', 'publishNoteWorkflow']),
      },
      root
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const INFO = { name: '@acme/notes', version: '1.0.0', pikkuCore: '^0.12.0' }

describe('buildSdkFiles', () => {
  test('emits exactly the five spec files', () => {
    withAddonOutput({}, (sources) => {
      const { files, manifest } = buildSdkFiles(sources, INFO)
      assert.deepEqual(
        [...files.keys()].sort(),
        [
          SDK_AGENT_MAP,
          SDK_FUNCTIONS_META,
          SDK_MANIFEST,
          SDK_RPC_MAP,
          SDK_WORKFLOW_MAP,
        ].sort()
      )
      assert.deepEqual(Object.keys(manifest), [
        'name',
        'version',
        'pikkuCore',
        'contractHash',
      ])
      assert.match(manifest.contractHash, /^[0-9a-f]{64}$/)
      assert.deepEqual(JSON.parse(files.get(SDK_MANIFEST)!), manifest)
    })
  })

  test('re-points sibling imports and inlines the custom types', () => {
    withAddonOutput({}, (sources) => {
      const rpcMap = buildSdkFiles(sources, INFO).files.get(SDK_RPC_MAP)!
      assert.deepEqual(listImportSpecifiers(rpcMap).sort(), [
        '../agent/pikku-agent-map.gen.d.js',
        '../workflow/pikku-workflow-map.gen.d.js',
        '@pikku/core/mcp',
        '@pikku/core/rpc',
      ])
      assert.match(rpcMap, /declare namespace __PikkuCustomTypes \{/)
      assert.match(
        rpcMap,
        /export type ListNotesOutput = \{ id: string; body: string \}\[\]/
      )
      assert.ok(!rpcMap.includes('pikku-custom-types'))
    })
  })

  test('refuses a map that imports from the addon source', () => {
    const rpcMap = `import type { Note } from '../../../src/notes.js'\n${RPC_MAP}`
    withAddonOutput({ rpcMap }, (sources) => {
      assert.throws(
        () => buildSdkFiles(sources, INFO),
        (error: unknown) =>
          error instanceof SdkImportError &&
          /imports '\.\.\/\.\.\/\.\.\/src\/notes\.js'/.test(error.message) &&
          /zod/.test(error.message)
      )
    })
  })

  test('refuses a package import other than @pikku/core', () => {
    const rpcMap = `import type { Kysely } from 'kysely'\n${RPC_MAP}`
    withAddonOutput({ rpcMap }, (sources) => {
      assert.throws(() => buildSdkFiles(sources, INFO), SdkImportError)
    })
  })

  test('the meta keeps what the maps declare, each with a contract hash', () => {
    withAddonOutput({}, (sources) => {
      const meta = JSON.parse(
        buildSdkFiles(sources, INFO).files.get(SDK_FUNCTIONS_META)!
      )
      // renameNote is exposed but not remote, so the SDK cannot call it, and
      // changing it must not move the SDK's hash or its bump.
      assert.deepEqual(Object.keys(meta), ['listNotes', 'publishNoteWorkflow'])
      assert.match(meta.listNotes.contractHash, /^[0-9a-f]{16}$/)
      assert.match(meta.publishNoteWorkflow.contractHash, /^[0-9a-f]{16}$/)
    })
  })

  test('each function carries the versions of its name and the latest of them', () => {
    const meta = {
      'listNotes@v1': { remote: true, version: 1, inputs: [], outputs: [] },
      'listNotes@v3': { remote: true, version: 3, inputs: [], outputs: [] },
      'listNotes@v2': { remote: true, version: 2, inputs: [], outputs: [] },
      renameNote: { remote: true, inputs: [], outputs: [] },
      'internalOnly@v4': { version: 4, inputs: [], outputs: [] },
    }
    withAddonOutput({ meta }, (sources) => {
      const sdk = JSON.parse(
        buildSdkFiles(sources, INFO).files.get(SDK_FUNCTIONS_META)!
      )
      for (const id of ['listNotes@v1', 'listNotes@v2', 'listNotes@v3']) {
        assert.deepEqual(sdk[id].versions, [1, 2, 3])
        assert.equal(sdk[id].latestVersion, 3)
      }
      assert.deepEqual(sdk.renameNote.versions, [1])
      assert.equal(sdk.renameNote.latestVersion, 1)
      // renameNote was never versioned: the host knows it only as renameNote.
      assert.deepEqual(sdkDefaultVersions(sdk), { listNotes: 'listNotes@v3' })
    })
  })

  test('the schemas the contract names travel with it', () => {
    const meta = {
      listNotes: {
        remote: true,
        inputs: [],
        outputs: ['ListNotesOutput'],
        outputSchemaName: 'ListNotesOutput',
      },
    }
    withAddonOutput({ meta }, (sources) => {
      const sdk = JSON.parse(
        buildSdkFiles(sources, INFO).files.get(SDK_FUNCTIONS_META)!
      )
      // In the meta itself, so the SDK stays at the five files a registry accepts.
      assert.deepEqual(sdk.listNotes.outputSchema, { type: 'array' })
      assert.equal(sdk.listNotes.inputSchema, undefined)
    })
  })

  test('an addon with no generated output is told to run pikku all', () => {
    withAddonOutput({}, (sources) => {
      assert.throws(
        () =>
          buildSdkFiles(
            { ...sources, functionsMeta: sources.functionsMeta + '.gone' },
            INFO
          ),
        /`pikku all` writes it before it packs the SDK/
      )
    })
  })
})

test('rewriteSdkFile refuses a relative import that leaves the SDK', () => {
  assert.throws(
    () =>
      rewriteSdkFile(
        SDK_WORKFLOW_MAP,
        '/a/.pikku/addon/workflow/pikku-workflow-map.gen.d.ts',
        "import type { X } from '../../src/x.js'\n",
        new Map(),
        { path: '/a/.pikku/addon/pikku-custom-types.gen.d.ts', content: '' }
      ),
    SdkImportError
  )
})

test('a packed SDK reads back as the same files a consumer extracts', () => {
  withAddonOutput({}, (sources) => {
    const { files } = buildSdkFiles(sources, INFO)
    const tgz = packTarGz(
      [...files].map(([path, content]) => ({
        path,
        content: Buffer.from(content),
      }))
    )
    assert.deepEqual(
      new Map(readTgz(tgz).map(({ path, data }) => [path, data.toString()])),
      files
    )
  })
})

test('the same SDK packs to the same bytes', () => {
  const entries = [{ path: 'manifest.json', content: Buffer.from('{}') }]
  assert.deepEqual(packTarGz(entries), packTarGz(entries))
})

test('sdkTarballName follows npm pack naming', () => {
  assert.equal(
    sdkTarballName('@acme/notes', '1.2.3'),
    'acme-notes-1.2.3.sdk.tgz'
  )
  assert.equal(sdkTarballName('notes', '0.1.0'), 'notes-0.1.0.sdk.tgz')
})
