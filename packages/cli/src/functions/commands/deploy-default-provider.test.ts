import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliBin = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../dist/bin/pikku.js'
)

let root: string

const runCli = (...args: string[]) =>
  new Promise<{ status: number | null; output: string }>((resolve) => {
    // Async on purpose: bun's spawnSync can miss a child's exit and spin forever.
    execFile(
      process.execPath,
      [cliBin, ...args],
      { cwd: root, encoding: 'utf-8', timeout: 120_000 },
      (error, stdout, stderr) =>
        resolve({
          status: error
            ? typeof error.code === 'number'
              ? error.code
              : null
            : 0,
          output: `${stdout}\n${stderr}`,
        })
    )
  })

const writeProvider = (name: string) => {
  const dir = join(root, 'node_modules', '@vendor', `deploy-${name}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: `@vendor/deploy-${name}`,
      version: '0.0.0',
      type: 'module',
      main: 'index.js',
    })
  )
  writeFileSync(
    join(dir, 'index.js'),
    `export const createAdapter = () => ({ name: '${name}', deployDirName: '${name}' })\n`
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-deploy-default-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'app', type: 'module' })
  )
  writeFileSync(
    join(root, 'pikku.config.json'),
    JSON.stringify({
      tsconfig: 'tsconfig.json',
      outDir: '.pikku',
      srcDirectories: ['src'],
      backends: { api: { filter: {} } },
      deploy: {
        providers: {
          first: '@vendor/deploy-first',
          second: '@vendor/deploy-second',
        },
        provider: 'first',
      },
    })
  )
  writeFileSync(join(root, 'tsconfig.json'), '{}')
  writeProvider('first')
  writeProvider('second')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('deploy.provider', () => {
  test('is used when no -p is given', async (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const { status, output } = await runCli('deploy', 'apply', '--fromPlan')
    assert.notEqual(status, 0)
    assert.match(output, /\.deploy\/first/)
  })

  test('loses to an explicit -p', async (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    const { status, output } = await runCli(
      'deploy',
      'apply',
      '--fromPlan',
      '-p',
      'second'
    )
    assert.notEqual(status, 0)
    assert.match(output, /\.deploy\/second/)
  })

  test('is standalone when the project names none', async (t) => {
    if (!existsSync(cliBin)) return t.skip('dist not built')
    writeProvider('standalone')
    writeFileSync(
      join(root, 'pikku.config.json'),
      JSON.stringify({
        tsconfig: 'tsconfig.json',
        outDir: '.pikku',
        srcDirectories: ['src'],
        backends: { api: { filter: {} } },
        deploy: { providers: { standalone: '@vendor/deploy-standalone' } },
      })
    )
    const { status, output } = await runCli('deploy', 'apply', '--fromPlan')
    assert.notEqual(status, 0)
    assert.match(output, /\.deploy\/standalone/)
  })
})
