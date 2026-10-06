import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeUnit,
  findInMemoryClasses,
  formatViolations,
  formatWarnings,
  importChain,
  type MetafileLike,
  type PackageLookup,
} from './runtime-verify.js'

const metafile: MetafileLike = {
  inputs: {
    'entry.ts': {
      imports: [
        { path: 'node_modules/@pikku/core/index.js' },
        { path: 'node_modules/better-auth/index.js' },
      ],
    },
    'node_modules/@pikku/core/index.js': { imports: [] },
    'node_modules/better-auth/index.js': {
      imports: [{ path: 'node_modules/@better-auth/utils/password.js' }],
    },
    'node_modules/@better-auth/utils/password.js': { imports: [] },
  },
  outputs: {
    'verify.js': {
      entryPoint: 'entry.ts',
      inputs: {
        'entry.ts': { bytesInOutput: 10 },
        'node_modules/@pikku/core/index.js': { bytesInOutput: 10 },
        'node_modules/better-auth/index.js': { bytesInOutput: 10 },
        'node_modules/@better-auth/utils/password.js': { bytesInOutput: 10 },
      },
    },
  },
}

const lookup: PackageLookup = (file) => {
  if (file.includes('@pikku/core'))
    return {
      name: '@pikku/core',
      tier: { tier: 'edge', declared: true, via: 'package' },
    }
  if (file.includes('better-auth'))
    return {
      name: 'better-auth',
      tier: { tier: 'serverless', declared: true, via: 'package' },
    }
  return undefined
}

const profile = { allowedBuiltins: ['crypto', 'path'], stubbedBuiltins: ['fs'] }

describe('analyzeUnit', () => {
  it('fails an edge unit that imports a serverless package, with the chain', () => {
    const a = analyzeUnit({
      unitName: 'u',
      unitTier: 'edge',
      profile,
      metafile,
      builtinImports: [],
      lookup,
    })
    assert.equal(a.violations.length, 1)
    const v = a.violations[0]!
    assert.equal(v.kind, 'package-tier')
    assert.deepEqual(v.kind === 'package-tier' && v.chain, [
      'entry.ts',
      'node_modules/better-auth/index.js',
    ])
  })

  it('passes the same unit on serverless', () => {
    const a = analyzeUnit({
      unitName: 'u',
      unitTier: 'serverless',
      profile,
      metafile,
      builtinImports: [],
      lookup,
    })
    assert.deepEqual(a.violations, [])
    assert.deepEqual(
      a.packages.map((p) => p.name),
      ['@pikku/core', 'better-auth']
    )
  })

  it('does not condemn undeclared packages', () => {
    const a = analyzeUnit({
      unitName: 'u',
      unitTier: 'edge',
      profile,
      metafile,
      builtinImports: [],
      lookup: () => ({
        name: 'zod',
        tier: { tier: 'serverless', declared: false, via: 'default' },
      }),
    })
    assert.deepEqual(a.violations, [])
  })

  it('ignores a package whose code was tree-shaken out', () => {
    const shaken: MetafileLike = structuredClone(metafile)
    shaken.outputs['verify.js']!.inputs[
      'node_modules/better-auth/index.js'
    ]!.bytesInOutput = 0
    shaken.outputs['verify.js']!.inputs[
      'node_modules/@better-auth/utils/password.js'
    ]!.bytesInOutput = 0
    const a = analyzeUnit({
      unitName: 'u',
      unitTier: 'edge',
      profile,
      metafile: shaken,
      builtinImports: [],
      lookup,
    })
    assert.deepEqual(a.violations, [])
  })

  it('fails a builtin the profile does not provide, on the specifier as written', () => {
    const a = analyzeUnit({
      unitName: 'u',
      unitTier: 'serverless',
      profile,
      metafile,
      lookup,
      builtinImports: [
        { specifier: 'os', importer: 'entry.ts' },
        { specifier: 'node:crypto', importer: 'entry.ts' },
      ],
    })
    assert.deepEqual(
      a.violations.map((v) => v.kind === 'builtin' && v.specifier),
      ['os']
    )
  })

  it('fails every builtin at the edge, even ones serverless allows', () => {
    const a = analyzeUnit({
      unitName: 'u',
      unitTier: 'edge',
      profile: { allowedBuiltins: [], stubbedBuiltins: [] },
      metafile,
      lookup: () => undefined,
      builtinImports: [{ specifier: 'node:crypto', importer: 'entry.ts' }],
    })
    assert.equal(a.violations.length, 1)
  })

  it('warns, rather than fails, on a stubbed builtin', () => {
    const a = analyzeUnit({
      unitName: 'u',
      unitTier: 'serverless',
      profile,
      metafile,
      lookup,
      builtinImports: [{ specifier: 'fs', importer: 'entry.ts' }],
    })
    assert.deepEqual(a.violations, [])
    assert.equal(a.warnings.length, 1)
    assert.match(formatWarnings(a), /stubbed-builtin=fs/)
  })

  it('skips a builtin imported only by a module that is not in the output', () => {
    const shaken: MetafileLike = structuredClone(metafile)
    shaken.outputs['verify.js']!.inputs[
      'node_modules/@pikku/core/index.js'
    ]!.bytesInOutput = 0
    const a = analyzeUnit({
      unitName: 'u',
      unitTier: 'serverless',
      profile,
      metafile: shaken,
      lookup: () => undefined,
      builtinImports: [
        { specifier: 'os', importer: 'node_modules/@pikku/core/index.js' },
      ],
    })
    assert.deepEqual(a.violations, [])
  })

  it('flags InMemory services on an edge unit only', () => {
    const bundleText = 'class InMemorySessionStore {}\nclass InMemoryQueue2 {}'
    const input = {
      unitName: 'u',
      profile,
      metafile,
      builtinImports: [],
      lookup: () => undefined,
      bundleText,
    }
    const edge = analyzeUnit({ ...input, unitTier: 'edge' })
    assert.deepEqual(
      edge.violations.map((v) => v.kind === 'in-memory' && v.className),
      ['InMemoryQueue', 'InMemorySessionStore']
    )
    assert.deepEqual(
      analyzeUnit({ ...input, unitTier: 'serverless' }).violations,
      []
    )
    assert.deepEqual(
      analyzeUnit({
        ...input,
        unitTier: 'edge',
        allowInMemory: ['InMemoryQueue', 'InMemorySessionStore'],
      }).violations,
      []
    )
  })

  it('formats an AI-parseable message with the fix', () => {
    const a = analyzeUnit({
      unitName: 'u',
      unitTier: 'edge',
      profile,
      metafile,
      builtinImports: [],
      lookup,
    })
    const text = formatViolations(a)
    assert.match(
      text,
      /^RUNTIME_TIER_VIOLATION unit=u unit-tier=edge violations=1/
    )
    assert.match(
      text,
      /package=better-auth package-tier=serverless unit-tier=edge/
    )
    assert.match(text, /import-chain: entry\.ts -> better-auth\/index\.js/)
    assert.match(
      text,
      /fix: .*edge-tier alternative, or move this unit to the serverless tier/
    )
  })
})

describe('importChain / findInMemoryClasses', () => {
  it('finds the shortest chain', () => {
    assert.deepEqual(
      importChain(
        metafile,
        'entry.ts',
        'node_modules/@better-auth/utils/password.js'
      ),
      [
        'entry.ts',
        'node_modules/better-auth/index.js',
        'node_modules/@better-auth/utils/password.js',
      ]
    )
  })
  it('falls back to the target alone when unreachable', () => {
    assert.deepEqual(importChain(metafile, undefined, 'x'), ['x'])
  })
  it('finds class names once, de-suffixed', () => {
    assert.deepEqual(
      findInMemoryClasses('class InMemoryA{} class InMemoryA2{} class Other{}'),
      ['InMemoryA']
    )
  })
})

describe('analyzeUnit: files no export names', () => {
  // mcp: root is server, `./fetch` is edge, and `mcp-auth.js` is exported by
  // neither. Reached only through fetch.js, it is as portable as fetch.js.
  const mcpLookup: PackageLookup = (file) => {
    if (!file.includes('modelcontextprotocol')) return undefined
    return file.endsWith('fetch.js')
      ? {
          name: '@pikku/modelcontextprotocol',
          tier: {
            tier: 'edge',
            declared: true,
            via: 'subpath',
            matchedSubpath: './fetch',
          },
        }
      : {
          name: '@pikku/modelcontextprotocol',
          tier: { tier: 'server', declared: true, via: 'package' },
        }
  }
  const bundle = (importers: string[]): MetafileLike => {
    const all: MetafileLike['inputs'] = {
      'entry.ts': { imports: importers.map((path) => ({ path })) },
      'node_modules/modelcontextprotocol/fetch.js': {
        imports: [{ path: 'node_modules/modelcontextprotocol/mcp-auth.js' }],
      },
      'node_modules/modelcontextprotocol/index.js': {
        imports: [{ path: 'node_modules/modelcontextprotocol/mcp-auth.js' }],
      },
      'node_modules/modelcontextprotocol/mcp-auth.js': { imports: [] },
    }
    // A real metafile lists only what was bundled.
    const included = [
      'entry.ts',
      'node_modules/modelcontextprotocol/mcp-auth.js',
      ...importers,
    ]
    return {
      inputs: Object.fromEntries(
        Object.entries(all).filter(([file]) => included.includes(file))
      ),
      outputs: {
        'verify.js': {
          entryPoint: 'entry.ts',
          // fetch.js is a re-export barrel: bundled, but tree-shaken to nothing.
          inputs: Object.fromEntries(
            included.map((f) => [
              f,
              { bytesInOutput: f.endsWith('fetch.js') ? 0 : 10 },
            ])
          ),
        },
      },
    }
  }
  const run = (importers: string[]) =>
    analyzeUnit({
      unitName: 'u',
      unitTier: 'edge',
      profile,
      metafile: bundle(importers),
      builtinImports: [],
      lookup: mcpLookup,
    })

  it('takes the tier of the export that imports it', () => {
    assert.deepEqual(
      run(['node_modules/modelcontextprotocol/fetch.js']).violations,
      []
    )
  })

  it('still fails when the server-tier entry is in the bundle too', () => {
    const a = run([
      'node_modules/modelcontextprotocol/fetch.js',
      'node_modules/modelcontextprotocol/index.js',
    ])
    assert.equal(a.violations.length, 1)
    assert.equal(a.violations[0]!.kind, 'package-tier')
  })

  it('stays at the package tier when only a server-tier file imports it', () => {
    const a = run(['node_modules/modelcontextprotocol/index.js'])
    assert.ok(a.violations.length >= 1)
  })
})
