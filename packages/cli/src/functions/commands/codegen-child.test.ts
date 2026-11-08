import assert from 'node:assert'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'

import {
  CodegenChildError,
  codegenStateFile,
  collectCodegenPass,
  hasChangesSince,
  runCodegenChild,
} from './codegen-child.js'

const project = (): string => mkdtempSync(join(tmpdir(), 'pikku-codegen-'))

test('a source file edited after codegen started counts as a change', () => {
  const dir = project()
  const file = join(dir, 'a.ts')
  writeFileSync(file, 'export {}')
  const started = Date.now()
  utimesSync(file, new Date(started - 5000), new Date(started - 5000))
  assert.equal(hasChangesSince([dir], started), false)
  utimesSync(file, new Date(started + 5000), new Date(started + 5000))
  assert.equal(hasChangesSince([dir], started), true)
})

test('generated files and node_modules do not count as changes', () => {
  const dir = project()
  mkdirSync(join(dir, 'node_modules'))
  const later = new Date(Date.now() + 5000)
  for (const name of ['x.gen.ts', 'node_modules/y.ts']) {
    const file = join(dir, name)
    writeFileSync(file, 'export {}')
    utimesSync(file, later, later)
  }
  assert.equal(hasChangesSince([dir], Date.now()), false)
})

test('a directory that does not exist has no changes', () => {
  assert.equal(hasChangesSince([join(tmpdir(), 'pikku-missing-dir')], 0), false)
})

test('each codegen run gets its own state file', () => {
  assert.notEqual(codegenStateFile(), codegenStateFile())
})

const originalArgv1 = process.argv[1]

afterEach(() => {
  process.argv[1] = originalArgv1
})

const script = (body: string): string => {
  const file = join(project(), 'child.mjs')
  writeFileSync(file, body)
  process.argv[1] = file
  return file
}

test('the child receives the command, state file and every set option', async () => {
  const out = join(project(), 'args.json')
  script(
    `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(out)}, JSON.stringify({ args: process.argv.slice(2), logo: process.env.PIKKU_NO_LOGO }))`
  )
  await runCodegenChild('/tmp/state.json', {
    command: ['all'],
    config: 'c.json',
    outDir: 'o',
    logLevel: 'debug',
    output: 'json',
    security: true,
    inheritStdout: false,
  })
  const seen = JSON.parse(readFileSync(out, 'utf-8'))
  assert.deepEqual(seen.args, [
    'all',
    '--stateOutput=/tmp/state.json',
    '--config=c.json',
    '--outDir=o',
    '--logLevel=debug',
    '--output=json',
    '--security',
  ])
  assert.equal(seen.logo, '1')
})

test('the parent node flags are forwarded ahead of the script', async () => {
  const out = join(project(), 'exec.json')
  script(
    `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.execArgv))`
  )
  const original = process.execArgv
  Object.defineProperty(process, 'execArgv', {
    value: ['--max-old-space-size=256'],
    configurable: true,
  })
  try {
    await runCodegenChild('s.json', { command: ['all'], inheritStdout: false })
  } finally {
    Object.defineProperty(process, 'execArgv', {
      value: original,
      configurable: true,
    })
  }
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf-8')), [
    '--max-old-space-size=256',
  ])
})

test('unset options are not passed to the child', async () => {
  const out = join(project(), 'args.json')
  script(
    `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)))`
  )
  await runCodegenChild('s.json', { command: ['a', 'b'], inheritStdout: true })
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf-8')), [
    'a',
    'b',
    '--stateOutput=s.json',
  ])
})

test('a child that exits non-zero rejects with its exit code', async () => {
  script('process.exit(3)')
  await assert.rejects(
    runCodegenChild('s.json', { command: ['all'], inheritStdout: false }),
    /pikku all failed \(exit 3\)/
  )
})

test('a failed child reports the last thing it wrote to stderr', async () => {
  script(
    `process.stderr.write('x'.repeat(2_000_000) + '\\nthe final cause')
process.exitCode = 1`
  )
  const error = await runCodegenChild('s.json', {
    command: ['all'],
    inheritStdout: false,
  }).then(
    () => assert.fail('expected a rejection'),
    (caught: unknown) => caught as CodegenChildError
  )
  assert.match(error.output, /the final cause$/)
})

test('a child that outlives timeoutMs is killed and rejects', async () => {
  const pidFile = join(project(), 'pid')
  script(
    `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))
setInterval(() => {}, 1000)`
  )
  await assert.rejects(
    runCodegenChild('s.json', {
      command: ['all'],
      inheritStdout: false,
      timeoutMs: 300,
    }),
    /pikku all failed \(SIGKILL\)/
  )
  const pid = Number(readFileSync(pidFile, 'utf-8'))
  assert.throws(() => process.kill(pid, 0), /ESRCH/)
})

test('a child that cannot be spawned rejects', async () => {
  script('')
  const exec = process.execPath
  Object.defineProperty(process, 'execPath', {
    value: join(project(), 'missing-binary'),
    configurable: true,
  })
  try {
    await assert.rejects(
      runCodegenChild('s.json', { command: ['all'], inheritStdout: false })
    )
  } finally {
    Object.defineProperty(process, 'execPath', {
      value: exec,
      configurable: true,
    })
  }
})

const diagnostic = { severity: 'warn', code: 'PKU1', message: 'careful' }

test('a pass keeps what the child recorded', async () => {
  const pass = await collectCodegenPass(async (file) => {
    writeFileSync(file, JSON.stringify([diagnostic]))
  })
  assert.deepEqual(pass, { ok: true, diagnostics: [diagnostic] })
})

test('a failed pass is an outcome carrying the reason', async () => {
  const pass = await collectCodegenPass(async () => {
    throw new Error('pikku all failed (exit 1)')
  })
  assert.equal(pass.ok, false)
  assert.equal(pass.diagnostics[0]?.code, 'CODEGEN')
  assert.match(pass.diagnostics[0]?.message ?? '', /exit 1/)
})

test('half a diagnostics file is treated as none', async () => {
  const pass = await collectCodegenPass(async (file) => {
    writeFileSync(file, '[{')
  })
  assert.deepEqual(pass, { ok: true, diagnostics: [] })
})

test('a failed child reports its errors, not its exit code', async () => {
  const pass = await collectCodegenPass(async (file) => {
    writeFileSync(
      file,
      JSON.stringify([
        diagnostic,
        { severity: 'error', code: 'LOG', message: 'a real cause' },
      ])
    )
    throw new CodegenChildError(
      'pikku all failed (exit 1)',
      'Workflow allWorkflow (run 1) failed:\nError: [PKU724] no services\n    at x\n'
    )
  })
  assert.deepEqual(
    pass.diagnostics.map(({ code }) => code),
    ['CODEGEN', 'PKU724', 'PKU1']
  )
  assert.equal(pass.diagnostics[0]?.message, 'a real cause')
})

test('a logged error does not fail a pass that passed', async () => {
  const pass = await collectCodegenPass(async (file) => {
    writeFileSync(
      file,
      JSON.stringify([{ severity: 'error', code: 'LOG', message: 'noise' }])
    )
  })
  assert.deepEqual(pass, { ok: true, diagnostics: [] })
})

test('a failure nothing can read keeps its tail', async () => {
  const pass = await collectCodegenPass(async () => {
    throw new CodegenChildError('pikku all failed (exit 1)', 'boom\n    at x\n')
  })
  assert.equal(pass.diagnostics[0]?.message, 'pikku all failed (exit 1)\nboom')
})
