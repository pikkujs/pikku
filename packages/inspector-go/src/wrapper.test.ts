import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getInitialInspectorState,
  serializeInspectorState,
} from '@pikku/inspector'
import { findInspectorBinary, platformPackageName } from './binary.js'
import { createRecordingLogger, replayDiagnostics } from './diagnostics.js'
import { InspectorBinaryError, runInspectorBinary } from './run-binary.js'
import { inspect } from './inspect.js'
import { INSPECTOR_PROTOCOL_VERSION, toAnalysisOptions } from './protocol.js'

const dir = mkdtempSync(join(tmpdir(), 'pikku-inspector-go-'))

/** A stand-in binary that records its argv and stdin, then prints `output`. */
const fakeBinary = (name: string, output: unknown, exitCode = 0): string => {
  const path = join(dir, name)
  writeFileSync(
    path,
    `#!/usr/bin/env node
const chunks = []
process.stdin.on('data', (c) => chunks.push(c))
process.stdin.on('end', () => {
  require('fs').writeFileSync(${JSON.stringify(path + '.input.json')}, JSON.stringify({ argv: process.argv.slice(2), input: JSON.parse(Buffer.concat(chunks).toString()) }))
  process.stdout.write(${JSON.stringify(typeof output === 'string' ? output : JSON.stringify(output))})
  process.exit(${exitCode})
})
`
  )
  chmodSync(path, 0o755)
  return path
}

const output = (overrides: Record<string, unknown> = {}) => ({
  protocol: INSPECTOR_PROTOCOL_VERSION,
  finalized: true,
  state: serializeInspectorState(getInitialInspectorState('/project')),
  diagnostics: [],
  stats: {
    files: 3,
    projectFiles: 2,
    types: 10,
    symbols: 20,
    wallMs: 5,
    heapUsedMb: 1,
  },
  ...overrides,
})

describe('findInspectorBinary', () => {
  test('PIKKU_INSPECTOR_GO_BIN wins', () => {
    assert.equal(
      findInspectorBinary({ PIKKU_INSPECTOR_GO_BIN: '/opt/pikku-inspect' }),
      '/opt/pikku-inspect'
    )
  })

  test('names the per-platform package esbuild style', () => {
    assert.equal(
      platformPackageName('darwin', 'arm64'),
      '@pikku/inspector-go-darwin-arm64'
    )
  })
})

describe('toAnalysisOptions', () => {
  test('passes on only what analysis and the Go finalize read', () => {
    assert.deepEqual(
      toAnalysisOptions({
        rootDir: '/p',
        tsconfig: '/p/tsconfig.json',
        openAPI: { additionalInfo: {} as any },
        manifest: null,
        modelAliases: {},
        oldProgram: {} as any,
      } as any),
      {
        rootDir: '/p',
        tsconfig: '/p/tsconfig.json',
        openAPI: { additionalInfo: {} },
        modelAliases: {},
      }
    )
  })
})

describe('replayDiagnostics', () => {
  test('critical goes to logger.critical with its code', () => {
    const logger = createRecordingLogger()
    replayDiagnostics(logger, [
      { level: 'critical', code: 'PKU123', message: 'bad' },
      { level: 'warn', code: 'PKU456', message: 'coded warn' },
      { level: 'warn', message: 'plain warn' },
      { level: 'info', message: 'hello' },
    ])
    assert.deepEqual(logger.diagnostics, [
      { level: 'critical', code: 'PKU123', message: 'bad' },
      { level: 'warn', code: 'PKU456', message: 'coded warn' },
      { level: 'warn', message: 'plain warn' },
      { level: 'info', message: 'hello' },
    ])
    assert.equal(logger.hasCriticalErrors(), true)
  })

  test('replays the validation-pass bracket around its diagnostics', () => {
    const calls: string[] = []
    const logger = {
      ...createRecordingLogger(),
      warn: (message: string) => calls.push(`warn ${message}`),
      beginValidationPass: () => calls.push('begin'),
      endValidationPass: () => calls.push('end'),
    }
    replayDiagnostics(
      logger,
      [
        { level: 'warn', message: 'analysis' },
        { level: 'warn', message: 'validation' },
      ],
      { start: 1, end: 2 }
    )
    assert.deepEqual(calls, [
      'warn analysis',
      'begin',
      'warn validation',
      'end',
    ])
  })

  test('an empty validation pass still opens and closes', () => {
    const calls: string[] = []
    replayDiagnostics(
      {
        ...createRecordingLogger(),
        beginValidationPass: () => calls.push('begin'),
        endValidationPass: () => calls.push('end'),
      },
      [],
      { start: 0, end: 0 }
    )
    assert.deepEqual(calls, ['begin', 'end'])
  })

  test('a critical without a code is a protocol violation', () => {
    assert.throws(() =>
      replayDiagnostics(createRecordingLogger(), [
        { level: 'critical', message: 'no code' },
      ])
    )
  })
})

describe('runInspectorBinary', () => {
  test('sends --stdin and the input as JSON', async () => {
    const binary = fakeBinary('ok', output())
    const input = { routeFiles: ['/p/a.ts'], options: { rootDir: '/p' } }
    await runInspectorBinary(binary, input)
    const seen = JSON.parse(readFileSync(binary + '.input.json', 'utf8'))
    assert.deepEqual(seen, { argv: ['--stdin'], input })
  })

  test('rejects a non-zero exit, non-JSON output and another protocol', async () => {
    for (const binary of [
      fakeBinary('exit', output(), 3),
      fakeBinary('garbage', 'not json'),
      fakeBinary('protocol', output({ protocol: 99 })),
    ]) {
      await assert.rejects(
        runInspectorBinary(binary, { routeFiles: [], options: {} }),
        InspectorBinaryError
      )
    }
  })
})

describe('inspect', () => {
  test('replays diagnostics and skips finalize when the binary finalized', async () => {
    const previous = process.env.PIKKU_INSPECTOR_GO_BIN
    process.env.PIKKU_INSPECTOR_GO_BIN = fakeBinary(
      'finalized',
      output({
        diagnostics: [{ level: 'warn', code: 'PKU001', message: 'careful' }],
      })
    )
    try {
      const logger = createRecordingLogger()
      const state = await inspect(logger, ['a.ts'], { rootDir: '/project' })
      assert.deepEqual(logger.diagnostics, [
        { level: 'warn', code: 'PKU001', message: 'careful' },
      ])
      // finalize always fills filesAndMethods; a finalized state is left as sent
      assert.deepEqual(state.filesAndMethods, {})
      assert.equal(state.stats?.projectFiles, 2)
      assert.equal(state.typesLookup.size, 0)
    } finally {
      if (previous === undefined) delete process.env.PIKKU_INSPECTOR_GO_BIN
      else process.env.PIKKU_INSPECTOR_GO_BIN = previous
    }
  })
})
