import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeDevContributors } from './write-dev-contributors.js'

const logger = new Proxy({}, { get: () => () => {} }) as never

describe('writeDevContributors', () => {
  let root: string
  let file: string
  const config = () =>
    ({
      rootDir: root,
      outDir: root,
      srcDirectories: ['src'],
      devContributorsFile: file,
      packageMappings: {},
    }) as never
  const state = (optedIn: Record<string, unknown>) =>
    ({
      optedInContributors: optedIn,
      serviceAggregation: { requiredServices: new Set<string>() },
      rpc: {
        wireAddonDeclarations: new Map([
          ['ns', { file: join(root, 'src/a.ts') }],
        ]),
      },
    }) as never

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-write-dev-contrib-'))
    file = join(root, 'contributors', 'dev.gen.ts')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  test('nothing opted in writes nothing and removes a stale file', async () => {
    mkdirSync(join(root, 'contributors'))
    writeFileSync(file, 'stale')
    await writeDevContributors(logger, config(), state({}))
    assert.equal(existsSync(file), false)
  })

  test('opted in but nothing selected for dev removes a stale file', async () => {
    mkdirSync(join(root, 'contributors'))
    writeFileSync(file, 'stale')
    mkdirSync(join(root, 'node_modules/addon'), { recursive: true })
    writeFileSync(join(root, 'node_modules/addon/package.json'), '{}')
    await writeDevContributors(
      logger,
      config(),
      state({
        ns: {
          packageName: 'addon',
          contributors: {
            deployOnly: { deploy: { module: 'x.ts', export: 'x' } },
          },
        },
      })
    )
    assert.equal(existsSync(file), false)
  })

  test('a selected contributor is written, importing only it', async () => {
    const dir = join(root, 'node_modules/addon/src')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(root, 'node_modules/addon/package.json'), '{}')
    writeFileSync(
      join(dir, 'mail.ts'),
      `export const mailDev = { provides: ['mail'], run(s) { s.mail = 1 } }\n`
    )
    writeFileSync(
      join(dir, 'other.ts'),
      `export const otherDev = { provides: ['o'], run() {} }\n`
    )
    await writeDevContributors(
      logger,
      config(),
      state({
        ns: {
          packageName: 'addon',
          contributors: {
            mail: { dev: { module: 'src/mail.ts', export: 'mailDev' } },
          },
        },
      })
    )
    const source = readFileSync(file, 'utf8')
    assert.match(source, /import \{ mailDev as contributor0 \}/)
    assert.ok(!source.includes('otherDev'))
    assert.match(source, /export const createPlatformServices/)
  })
})
