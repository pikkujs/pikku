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
import { gunzipSync, gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import {
  buildSdkFiles,
  checkSdkBump,
  listImportSpecifiers,
  loadPreviousSdk,
  rewriteSdkFile,
  SdkImportError,
  sdkTarballName,
  SDK_AGENT_MAP,
  SDK_FUNCTIONS_META,
  SDK_MANIFEST,
  SDK_RPC_MAP,
  SDK_WORKFLOW_MAP,
  sdkDefaultVersions,
  sdkSchemas,
  type SdkManifest,
} from './addon-sdk.js'
import { packTarGz, unpackTarGz } from './sdk-tarball.js'

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
      assert.deepEqual(sdkDefaultVersions(sdk), {
        listNotes: 'listNotes@v3',
        renameNote: 'renameNote@v1',
      })
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
      assert.deepEqual(sdkSchemas(sdk), { ListNotesOutput: { type: 'array' } })
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
        /Run `pikku all` in the addon before `pikku sdk`/
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

describe('checkSdkBump', () => {
  const previous = (
    version: string,
    functions: Record<
      string,
      { contractHash: string; outputSchemaName: string }
    >
  ) => ({
    manifest: {
      name: '@acme/notes',
      version,
      pikkuCore: '^0.12.0',
      contractHash: '',
    } satisfies SdkManifest,
    functions,
  })
  // Without the packed schemas every named schema is unresolved, and a moved
  // hash is all surface-diff has to go on — as for an SDK cut before them.
  const fn = (contractHash: string) => ({
    contractHash,
    outputSchemaName: 'ListNotesOutput',
  })
  const base = { listNotes: fn('aaaa') }

  test('an unchanged contract needs a patch', () => {
    const check = checkSdkBump(
      previous('1.2.3', base),
      { functions: base },
      '1.2.4',
      'prev'
    )
    assert.equal(check.changes.verdict, 'patch')
    assert.equal(check.requiredVersion, '1.2.4')
  })

  test('an added function needs a minor', () => {
    const current = { ...base, addNote: fn('bbbb') }
    assert.equal(
      checkSdkBump(
        previous('1.2.3', base),
        { functions: current },
        '1.3.0',
        'prev'
      ).requiredVersion,
      '1.3.0'
    )
    assert.throws(
      () =>
        checkSdkBump(
          previous('1.2.3', base),
          { functions: current },
          '1.2.4',
          'prev'
        ),
      /SDK version 1\.2\.4 is too low: the contract change since 1\.2\.3 is minor, so the SDK must be at least 1\.3\.0/
    )
  })

  test('a removed function needs a major', () => {
    assert.throws(
      () =>
        checkSdkBump(
          previous('1.2.3', base),
          { functions: {} },
          '1.3.0',
          'prev'
        ),
      /is major, so the SDK must be at least 2\.0\.0/
    )
  })

  test('a changed contract hash needs a major', () => {
    const changed = { listNotes: fn('cccc') }
    assert.equal(
      checkSdkBump(
        previous('1.2.3', base),
        { functions: changed },
        '2.0.0',
        'prev'
      ).changes.verdict,
      'major'
    )
  })

  describe('with the schemas packed', () => {
    const NOTES = 'ListNotesOutput'
    const withSchema = (schema: unknown) => ({
      functions: {
        listNotes: {
          ...fn(String(JSON.stringify(schema).length)),
          outputSchemaName: NOTES,
          outputSchema: schema,
        },
      },
    })
    const strict = {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    }
    const prior = (schema: unknown) => ({
      ...previous('1.2.3', {}),
      ...withSchema(schema),
    })

    test('a contract loosened in place needs only a minor', () => {
      const loosened = {
        type: 'object',
        properties: { id: { type: 'string' }, tag: { type: 'string' } },
        required: ['id'],
      }
      const check = checkSdkBump(
        prior(strict),
        withSchema(loosened),
        '1.3.0',
        'prev'
      )
      assert.equal(check.changes.verdict, 'minor')
    })

    test('a contract tightened in place needs a major', () => {
      const tightened = { ...strict, required: [] }
      assert.equal(
        checkSdkBump(prior(strict), withSchema(tightened), '2.0.0', 'prev')
          .changes.verdict,
        'major'
      )
    })
  })

  test('a new function version beside the old one needs a minor', () => {
    const v1 = { ...fn('aaaa'), versions: [1], latestVersion: 1 }
    const both = {
      'listNotes@v1': { ...v1, versions: [1, 2], latestVersion: 2 },
      'listNotes@v2': { ...fn('bbbb'), versions: [1, 2], latestVersion: 2 },
    }
    assert.equal(
      checkSdkBump(
        previous('1.2.3', { 'listNotes@v1': v1 }),
        { functions: both },
        '1.3.0',
        'prev'
      ).changes.verdict,
      'minor'
    )
  })

  test('dropping a function version needs a major', () => {
    const both = {
      'listNotes@v1': { ...fn('aaaa'), versions: [1, 2], latestVersion: 2 },
      'listNotes@v2': { ...fn('bbbb'), versions: [1, 2], latestVersion: 2 },
    }
    const onlyV2 = {
      'listNotes@v2': { ...fn('bbbb'), versions: [2], latestVersion: 2 },
    }
    assert.equal(
      checkSdkBump(
        previous('1.2.3', both),
        { functions: onlyV2 },
        '2.0.0',
        'prev'
      ).changes.verdict,
      'major'
    )
  })
})

test('a packed SDK unpacks to the same files, and reloads as a previous SDK', () => {
  withAddonOutput({}, (sources, root) => {
    const { files, manifest } = buildSdkFiles(sources, INFO)
    const tgz = packTarGz(
      [...files].map(([path, content]) => ({
        path,
        content: Buffer.from(content),
      }))
    )
    const unpacked = unpackTarGz(tgz)
    assert.deepEqual(
      new Map([...unpacked].map(([p, c]) => [p, c.toString()])),
      files
    )
    const tgzPath = join(root, sdkTarballName(INFO.name, INFO.version))
    writeFileSync(tgzPath, tgz)
    const loaded = loadPreviousSdk(tgzPath)
    assert.deepEqual(loaded.manifest, manifest)
    assert.deepEqual(Object.keys(loaded.functions), [
      'listNotes',
      'publishNoteWorkflow',
    ])
  })
})

test('an archive entry with a malformed size is refused, not looped on', () => {
  const tar = Buffer.from(
    gunzipSync(
      packTarGz([{ path: 'manifest.json', content: Buffer.from('{}') }])
    )
  )
  for (const size of ['-0001000', '99999999', '7777777']) {
    const header = Buffer.alloc(12)
    header.write(size)
    header.copy(tar, 124)
    assert.throws(
      () => unpackTarGz(gzipSync(tar)),
      /Not a valid SDK archive: the entry at byte 0 has size/
    )
  }
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
