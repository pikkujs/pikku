// node --test containers/sandbox/pi/parse-check.test.mjs
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { parseErrors } from './parse-check.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OXFMT_BIN = join(REPO, 'node_modules/.bin')
const available = existsSync(join(OXFMT_BIN, 'oxfmt'))

function withProject(files, run) {
  const cwd = join(tmpdir(), `parse-check-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(cwd, 'node_modules'), { recursive: true })
  symlinkSync(OXFMT_BIN, join(cwd, 'node_modules/.bin'))
  const paths = []
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(cwd, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
    paths.push(abs)
  }
  try {
    return run(cwd, paths)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

test('a file that does not parse is reported with its line', { skip: !available }, () => {
  const found = withProject(
    {
      'src/ok.ts': 'export const ok = 1\n',
      'src/bad.tsx': 'export function App() {\n  return <div>{x.map((i) => <b>{i}</b>)}\n}\n',
    },
    (cwd, paths) => {
      const found = parseErrors(cwd, paths)
      if (found) return found
      const probe = spawnSync(join(cwd, 'node_modules/.bin/oxfmt'), ['--check', ...paths], { cwd, encoding: 'utf8' })
      return `PROBE ${JSON.stringify({ status: probe.status, signal: probe.signal, error: String(probe.error), out: probe.stdout, err: probe.stderr })}`
    },
  )
  assert.doesNotMatch(found ?? '', /PROBE/, found)
  assert.ok(found, 'a broken file should be reported')
  assert.match(found, /DO NOT PARSE/)
  assert.match(found, /src\/bad\.tsx:\d+/)
  assert.doesNotMatch(found, /src\/ok\.ts/)
})

test('badly formatted but valid source is not an error', { skip: !available }, () => {
  const found = withProject(
    { 'src/ugly.ts': 'export const z   =    {a:1,b:2}\n' },
    (cwd, paths) => parseErrors(cwd, paths),
  )
  assert.equal(found, null)
})

test('generated and .pikku files are never checked', { skip: !available }, () => {
  const found = withProject(
    { 'src/broken.gen.ts': 'export const x = {\n', '.pikku/also.ts': 'const y = {\n' },
    (cwd, paths) => parseErrors(cwd, paths),
  )
  assert.equal(found, null)
})

test('a project without oxfmt installed is left alone', () => {
  const cwd = join(tmpdir(), `parse-check-bare-${Date.now()}`)
  mkdirSync(join(cwd, 'src'), { recursive: true })
  writeFileSync(join(cwd, 'src/bad.ts'), 'export const x = {\n', 'utf8')
  try {
    assert.equal(parseErrors(cwd, [join(cwd, 'src/bad.ts')]), null)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
