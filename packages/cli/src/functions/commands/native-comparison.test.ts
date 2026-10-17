import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  diffHashes,
  formatBytes,
  formatComparison,
  formatDuration,
  median,
  summarizeRuns,
  type NativeComparisonResult,
  type RunMeasurement,
} from './native-comparison-report.js'
import {
  parseCpuTime,
  parseFootprintOutput,
  parsePsOutput,
  parseTimeReport,
  processTree,
  resolveCliInvocation,
  shortCommand,
} from './native-comparison-measure.js'
import {
  GeneratedSnapshot,
  findGeneratedPaths,
  hashGeneratedOutput,
} from './native-comparison-snapshot.js'
import { parseRuns } from './experiment-native-comparison.js'

const MiB = 1024 * 1024

const measurement = (
  overrides: Partial<RunMeasurement> = {}
): RunMeasurement => ({
  engine: 'typescript',
  run: 1,
  exitCode: 0,
  wallMs: 1000,
  cpuUserMs: 800,
  cpuSysMs: 200,
  cpuSource: 'rusage',
  peakProcessRssBytes: 100 * MiB,
  peakProcessRssCommand: 'node pikku.js',
  peakTotalRssBytes: 120 * MiB,
  ...overrides,
  processes: overrides.processes ?? [
    {
      pid: 1,
      command: overrides.peakProcessRssCommand ?? 'node pikku.js',
      peakRssBytes: overrides.peakProcessRssBytes ?? 100 * MiB,
    },
  ],
})

describe('stats aggregation', () => {
  test('median of odd and even counts', () => {
    assert.equal(median([3, 1, 2]), 2)
    assert.equal(median([4, 1, 3, 2]), 2.5)
    assert.equal(median([]), 0)
  })

  test('summarizeRuns takes the median per engine and ignores the other engine', () => {
    const runs = [
      measurement({ wallMs: 3000, peakTotalRssBytes: 300 * MiB }),
      measurement({ run: 2, wallMs: 1000, peakTotalRssBytes: 100 * MiB }),
      measurement({ run: 3, wallMs: 2000, peakTotalRssBytes: 200 * MiB }),
      measurement({ engine: 'native', wallMs: 99_999 }),
    ]
    const summary = summarizeRuns('typescript', runs)
    assert.equal(summary.runs, 3)
    assert.equal(summary.wallMs, 2000)
    assert.equal(summary.cpuMs, 1000)
    assert.equal(summary.peakTotalRssBytes, 200 * MiB)
    assert.equal(summary.peakProcessFootprintBytes, undefined)
    assert.equal(summary.cpuSource, 'rusage')
    assert.equal(summary.processes[0]!.peakRssBytes, 100 * MiB)
  })

  test('one sampled run makes the summary sampled', () => {
    const summary = summarizeRuns('native', [
      measurement({ engine: 'native' }),
      measurement({ engine: 'native', cpuSource: 'sampled' }),
    ])
    assert.equal(summary.cpuSource, 'sampled')
  })
})

describe('output diff', () => {
  test('identical hashes', () => {
    const diff = diffHashes({ a: '1', b: '2' }, { b: '2', a: '1' })
    assert.deepEqual(diff, {
      identical: true,
      fileCount: 2,
      differing: [],
      onlyInTypescript: [],
      onlyInNative: [],
    })
  })

  test('differing, missing and extra files', () => {
    const diff = diffHashes(
      { same: '1', changed: '2', gone: '3' },
      { same: '1', changed: 'x', added: '4' }
    )
    assert.equal(diff.identical, false)
    assert.equal(diff.fileCount, 4)
    assert.deepEqual(diff.differing, ['changed'])
    assert.deepEqual(diff.onlyInTypescript, ['gone'])
    assert.deepEqual(diff.onlyInNative, ['added'])
  })
})

describe('table formatting', () => {
  const result = (
    overrides: Partial<NativeComparisonResult> = {}
  ): NativeComparisonResult => ({
    projectDir: '/project',
    platform: 'linux',
    runs: 1,
    typescript: summarizeRuns('typescript', [
      measurement({ wallMs: 12_000, peakProcessRssBytes: 1400 * MiB }),
    ]),
    native: summarizeRuns('native', [
      measurement({
        engine: 'native',
        wallMs: 6000,
        peakProcessRssBytes: 700 * MiB,
        peakProcessRssCommand: 'pikku-inspect',
      }),
    ]),
    output: {
      ...diffHashes({ a: '1' }, { a: '1' }),
      nondeterministic: { typescript: [], native: [] },
    },
    measurements: [],
    notes: [],
    ...overrides,
  })

  test('formats durations and sizes', () => {
    assert.equal(formatDuration(12_345), '12.35s')
    assert.equal(formatDuration(250), '250ms')
    assert.equal(formatBytes(1400 * MiB), '1.37 GiB')
    assert.equal(formatBytes(50 * MiB), '50 MiB')
  })

  test('side by side, with delta and ratio', () => {
    const text = formatComparison(result())
    const wall = text.split('\n').find((l) => l.startsWith('Wall time'))!
    assert.match(wall, /12\.00s\s+6\.00s\s+-6\.00s\s+0\.50x$/)
    const rss = text
      .split('\n')
      .find((l) => l.startsWith('Peak RSS, largest process'))!
    assert.match(rss, /1\.37 GiB\s+700 MiB\s+-700 MiB\s+0\.50x$/)
    assert.match(text, /Output: identical \(1 files\)/)
    assert.match(
      text,
      /Processes \(peak RSS\):\n {2}TypeScript\n {4}node pikku\.js\s+1\.37 GiB\n {2}Native\n {4}pikku-inspect\s+700 MiB/
    )
    assert.doesNotMatch(text, /footprint/)
  })

  test('footprint rows only when measured', () => {
    const r = result()
    r.typescript.peakProcessFootprintBytes = 900 * MiB
    r.native.peakProcessFootprintBytes = 50 * MiB
    r.typescript.peakTotalFootprintBytes = 950 * MiB
    r.native.peakTotalFootprintBytes = 300 * MiB
    const text = formatComparison(r)
    assert.match(text, /Peak footprint, largest process\s+900 MiB\s+50 MiB/)
    assert.match(text, /Peak footprint, process tree\s+950 MiB\s+300 MiB/)
  })

  test('lists differing files, capped', () => {
    const text = formatComparison(
      result({
        output: {
          ...diffHashes(
            { a: '1', b: '1', c: '1', gone: '1' },
            { a: '2', b: '2', c: '2' }
          ),
          nondeterministic: { typescript: ['ts-only.json'], native: [] },
        },
      }),
      { fileLimit: 2 }
    )
    assert.match(text, /Output: DIFFERS \(4 of 4 files\)/)
    assert.match(text, /content differs \(3\):\n {4}a\n {4}b\n {4}… and 1 more/)
    assert.match(text, /only from TypeScript \(1\):\n {4}gone/)
    assert.match(
      text,
      /changed between typescript runs \(1\):\n {4}ts-only\.json/
    )
  })
})

describe('process sampling', () => {
  test('parses ps rows and CPU time formats', () => {
    const rows = parsePsOutput(
      [
        '  100     1  2048   0:01.50 /usr/bin/time -p node pikku.js',
        '  101   100 409600   1:02.25 node /x/dist/bin/pikku.js all',
        '  102   101 10240 01:00:00 /x/pikku-inspect --project p',
        '  200     1  1024 1-00:00:01 unrelated',
        'garbage',
      ].join('\n')
    )
    assert.equal(rows.length, 4)
    assert.deepEqual(rows[1], {
      pid: 101,
      ppid: 100,
      rssBytes: 409600 * 1024,
      cpuMs: 62_250,
      args: 'node /x/dist/bin/pikku.js all',
    })
    assert.equal(rows[2]!.cpuMs, 3_600_000)
    assert.equal(parseCpuTime('1-00:00:01'), 86_401_000)
    assert.deepEqual(
      processTree(rows, 100).map((r) => r.pid),
      [100, 101, 102]
    )
    assert.deepEqual(processTree(rows, 999), [])
  })

  test('parses footprint output', () => {
    const text = `======================================================================
node [101]: 64-bit    Footprint: 1638736 B (16384 bytes per page)
======================================================================

Auxiliary data:
    phys_footprint: 1655120 B
    phys_footprint_peak: 9655120 B

======================================================================
pikku-inspect [102]: 64-bit    Footprint: 852160 B (16384 bytes per page)
======================================================================

Auxiliary data:
    phys_footprint: 868544 B
    phys_footprint_peak: 884928 B

======================================================================
Summary Footprint: 2458128 B
======================================================================
`
    const parsed = parseFootprintOutput(text)
    assert.deepEqual(parsed.get(101), {
      footprintBytes: 1655120,
      peakBytes: 9655120,
    })
    assert.deepEqual(parsed.get(102), {
      footprintBytes: 868544,
      peakBytes: 884928,
    })
    assert.equal(parsed.size, 2)
  })

  test('parses the time -p report after codegen output', () => {
    assert.deepEqual(
      parseTimeReport(
        'codegen says user 1\nreal 12.40\nuser 20.31\nsys 1.05\n'
      ),
      { userMs: 20_310, sysMs: 1050 }
    )
    assert.equal(parseTimeReport('no report'), undefined)
  })

  test('short command names', () => {
    assert.equal(
      shortCommand('/opt/node/bin/node /x/dist/bin/pikku.js all'),
      'node pikku.js'
    )
    assert.equal(shortCommand('/x/bin/pikku-inspect --x'), 'pikku-inspect')
    assert.equal(shortCommand('(node)'), 'node')
    assert.equal(shortCommand('node --max-old-space-size=4096 x.js'), 'node')
  })
})

describe('CLI invocation', () => {
  test('a node install runs its own bin', () => {
    const inv = resolveCliInvocation({
      execPath: '/usr/bin/node',
      execArgv: ['--enable-source-maps'],
      moduleUrl:
        'file:///p/cli/dist/src/functions/commands/native-comparison-measure.js',
      argv1: '/somewhere/else',
      exists: (p) => p === '/p/cli/dist/bin/pikku.js',
    })
    assert.deepEqual(inv, {
      command: '/usr/bin/node',
      args: ['--enable-source-maps', '/p/cli/dist/bin/pikku.js'],
    })
  })

  test('a bun-compiled binary is started directly', () => {
    const inv = resolveCliInvocation({
      execPath: '/opt/homebrew/bin/pikku',
      execArgv: [],
      moduleUrl: 'file:///$bunfs/root/pikku',
      argv1: '/$bunfs/root/pikku',
      exists: () => false,
    })
    assert.deepEqual(inv, { command: '/opt/homebrew/bin/pikku', args: [] })
  })

  test('falls back to argv[1] when the bin is not beside the module', () => {
    const inv = resolveCliInvocation({
      execPath: '/bun',
      execArgv: [],
      moduleUrl:
        'file:///p/cli/src/functions/commands/native-comparison-measure.ts',
      argv1: '/p/cli/bin/pikku.ts',
      exists: () => false,
    })
    assert.deepEqual(inv, { command: '/bun', args: ['/p/cli/bin/pikku.ts'] })
  })
})

describe('--runs', () => {
  test('defaults to one and refuses anything but a positive integer', () => {
    assert.equal(parseRuns(undefined), 1)
    assert.equal(parseRuns('3'), 3)
    assert.throws(() => parseRuns('0'), /positive integer/)
    assert.throws(() => parseRuns('1.5'), /positive integer/)
    assert.throws(() => parseRuns('abc'), /positive integer/)
  })
})

describe('generated snapshot', () => {
  let root: string
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const setup = () => {
    root = mkdtempSync(join(tmpdir(), 'native-comparison-test-'))
    const outDir = join(root, 'packages/functions/.pikku')
    mkdirSync(join(outDir, 'db'), { recursive: true })
    writeFileSync(join(outDir, 'db/schema.d.ts'), 'schema')
    writeFileSync(join(outDir, 'meta.gen.json'), '{}')
    mkdirSync(join(root, 'sdk'), { recursive: true })
    writeFileSync(join(root, 'sdk/api.gen.ts'), 'api')
    writeFileSync(join(root, 'sdk/hand-written.ts'), 'mine')
    mkdirSync(join(root, 'node_modules/x'), { recursive: true })
    writeFileSync(join(root, 'node_modules/x/dep.gen.ts'), 'dep')
    return outDir
  }

  test('finds .pikku dirs and gen files outside them, skipping node_modules', () => {
    const outDir = setup()
    const paths = findGeneratedPaths(root, outDir)
    assert.deepEqual(paths.pikkuDirs, [outDir])
    assert.deepEqual(paths.genFiles, [join(root, 'sdk/api.gen.ts')])
    assert.deepEqual(Object.keys(hashGeneratedOutput(root, outDir)).sort(), [
      'packages/functions/.pikku/db/schema.d.ts',
      'packages/functions/.pikku/meta.gen.json',
      'sdk/api.gen.ts',
    ])
  })

  test('restore puts back changed, deleted and new files, and timestamps', () => {
    const outDir = setup()
    const old = new Date('2020-01-01T00:00:00Z')
    utimesSync(join(root, 'sdk/api.gen.ts'), old, old)
    const before = hashGeneratedOutput(root, outDir)
    const snapshot = GeneratedSnapshot.take(root, outDir)

    rmSync(join(outDir, 'db'), { recursive: true })
    writeFileSync(join(outDir, 'meta.gen.json'), '{"changed":true}')
    writeFileSync(join(outDir, 'new.gen.ts'), 'new')
    writeFileSync(join(root, 'sdk/api.gen.ts'), 'changed')
    writeFileSync(join(root, 'sdk/new.gen.ts'), 'new')
    mkdirSync(join(root, 'other/.pikku'), { recursive: true })

    snapshot.restore()
    snapshot.dispose()

    assert.deepEqual(hashGeneratedOutput(root, outDir), before)
    assert.equal(readFileSync(join(outDir, 'db/schema.d.ts'), 'utf8'), 'schema')
    assert.equal(existsSync(join(root, 'sdk/new.gen.ts')), false)
    assert.equal(existsSync(join(root, 'other/.pikku')), false)
    assert.equal(
      readFileSync(join(root, 'sdk/hand-written.ts'), 'utf8'),
      'mine'
    )
    assert.equal(
      statSync(join(root, 'sdk/api.gen.ts')).mtime.getTime(),
      old.getTime()
    )
  })
})
