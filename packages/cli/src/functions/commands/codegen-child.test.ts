import assert from 'node:assert'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { afterEach, test } from 'node:test'

import {
  codegenStateFile,
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
  ])
  assert.equal(seen.logo, '1')
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
