import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  runAppList,
  runAppNativeAdd,
  runAppNativeCheck,
  runAppNativeInit,
  runAppNativeUpgrade,
  type AppProject,
} from './run.js'

const tempDirs: string[] = []
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

const writeJson = (path: string, data: unknown) =>
  writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, 'utf-8'))

const newProject = async (
  frontends: Record<string, unknown>
): Promise<AppProject> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-app-'))
  tempDirs.push(root)
  await writeJson(join(root, 'package.json'), { name: '@acme/shop' })
  await writeJson(join(root, 'pikku.config.json'), {
    srcDirectories: ['src'],
    frontends,
  })
  for (const name of Object.keys(frontends)) {
    await mkdir(join(root, 'apps', name), { recursive: true })
    await writeJson(join(root, 'apps', name, 'package.json'), {
      name,
      devDependencies: { '@tauri-apps/cli': '2.1.0' },
    })
  }
  return { configDir: root, rootDir: root }
}

const configOf = (project: AppProject) =>
  readJson(join(project.configDir, 'pikku.config.json'))

describe('runAppNativeInit', () => {
  test('saves the native entry, then writes the project from it', async () => {
    const project = await newProject({
      'customer-app': { cwd: 'apps/customer-app', kind: 'spa' },
    })

    const result = await runAppNativeInit(project, {
      name: 'customer-app',
      android: true,
      desktop: true,
      plugins: 'store',
    })

    assert.equal(result.refusal, null)
    assert.equal(result.created, true)
    assert.deepEqual(
      (await configOf(project)).frontends['customer-app'].native,
      {
        identifier: 'com.acme.customerapp',
        platforms: ['desktop', 'android'],
        plugins: ['store'],
      }
    )
    const conf = await readJson(join(result.dir, 'tauri.conf.json'))
    assert.equal(conf.identifier, 'com.acme.customerapp')
    assert.equal(conf.build.frontendDist, '../dist')
  })

  test('adds the Tauri packages without overriding a pinned version', async () => {
    const project = await newProject({ web: { cwd: 'apps/web' } })

    await runAppNativeInit(project, { name: 'web', plugins: 'dialog' })

    const pkg = await readJson(join(project.configDir, 'apps/web/package.json'))
    assert.equal(pkg.devDependencies['@tauri-apps/cli'], '2.1.0')
    assert.equal(pkg.dependencies['@tauri-apps/plugin-dialog'], '^2')
    assert.equal(pkg.scripts.tauri, 'tauri')
  })

  test('defaults a bundled server to desktop only', async () => {
    const project = await newProject({ desk: { cwd: 'apps/desk' } })

    const result = await runAppNativeInit(project, {
      name: 'desk',
      bundleServer: true,
    })

    assert.equal(result.refusal, null)
    assert.deepEqual((await configOf(project)).frontends.desk.native, {
      identifier: 'com.acme.desk',
      platforms: ['desktop'],
      plugins: [],
      bundleServer: true,
    })
  })

  test('a second init syncs the existing project rather than recreating it', async () => {
    const project = await newProject({ web: { cwd: 'apps/web' } })
    await runAppNativeInit(project, { name: 'web' })

    const again = await runAppNativeInit(project, {
      name: 'web',
      identifier: 'com.acme.webshop',
    })

    assert.equal(again.refusal, null)
    assert.equal(again.created, false)
    assert.equal(
      (await readJson(join(again.dir, 'tauri.conf.json'))).identifier,
      'com.acme.webshop'
    )
  })

  test('refuses a server-rendered frontend in bundle mode', async () => {
    const project = await newProject({ web: { cwd: 'apps/web', kind: 'ssr' } })

    const result = await runAppNativeInit(project, { name: 'web' })

    assert.match(result.refusal ?? '', /server-rendered/)
    assert.equal((await configOf(project)).frontends.web.native, undefined)
  })

  test('opens a server-rendered frontend by url', async () => {
    const project = await newProject({ web: { cwd: 'apps/web', kind: 'ssr' } })

    const result = await runAppNativeInit(project, {
      name: 'web',
      url: 'https://shop.example.com',
    })

    assert.equal(result.refusal, null)
    assert.equal(
      (await readJson(join(result.dir, 'tauri.conf.json'))).build.frontendDist,
      'https://shop.example.com'
    )
  })

  test('refuses an identifier another app already holds', async () => {
    const project = await newProject({
      web: {
        cwd: 'apps/web',
        native: { identifier: 'com.acme.shop', platforms: ['desktop'] },
      },
      admin: { cwd: 'apps/admin' },
    })

    const result = await runAppNativeInit(project, {
      name: 'admin',
      identifier: 'com.acme.shop',
    })

    assert.match(result.refusal ?? '', /already web's identifier/)
  })

  test('refuses an identifier Android would refuse', async () => {
    const project = await newProject({ web: { cwd: 'apps/web' } })

    const result = await runAppNativeInit(project, {
      name: 'web',
      identifier: 'com.acme.my-shop',
    })

    assert.match(result.refusal ?? '', /hyphens/)
  })

  test('refuses an unknown frontend by naming the known ones', async () => {
    const project = await newProject({ web: { cwd: 'apps/web' } })

    const result = await runAppNativeInit(project, { name: 'mobile' })

    assert.match(result.refusal ?? '', /no frontend named "mobile".*web/)
  })

  test('refuses a project with no pikku.config.json', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-app-'))
    tempDirs.push(root)

    const result = await runAppNativeInit(
      { configDir: root, rootDir: root },
      { name: 'web' }
    )

    assert.match(result.refusal ?? '', /no pikku\.config\.json/)
  })
})

describe('runAppNativeAdd', () => {
  test('adds plugins to the config and the project', async () => {
    const project = await newProject({ web: { cwd: 'apps/web' } })
    await runAppNativeInit(project, { name: 'web', plugins: 'store' })

    const result = await runAppNativeAdd(project, {
      name: 'web',
      plugins: ['haptics', 'store'],
    })

    assert.equal(result.refusal, null)
    assert.deepEqual((await configOf(project)).frontends.web.native.plugins, [
      'store',
      'haptics',
    ])
    assert.match(
      await readFile(join(result.dir, 'Cargo.toml'), 'utf-8'),
      /tauri-plugin-haptics = "2"/
    )
  })

  test('refuses when no plugin is named', async () => {
    const project = await newProject({ web: { cwd: 'apps/web' } })

    const result = await runAppNativeAdd(project, { name: 'web', plugins: [] })

    assert.match(result.refusal ?? '', /name the plugins/)
  })

  test('refuses a frontend with no native app', async () => {
    const project = await newProject({ web: { cwd: 'apps/web' } })

    const result = await runAppNativeAdd(project, {
      name: 'web',
      plugins: ['store'],
    })

    assert.match(result.refusal ?? '', /pikku app native init web/)
  })
})

describe('runAppNativeUpgrade', () => {
  test('re-applies a native entry edited by hand', async () => {
    const project = await newProject({ web: { cwd: 'apps/web' } })
    const { dir } = await runAppNativeInit(project, { name: 'web' })
    const config = await configOf(project)
    config.frontends.web.native.plugins = ['dialog']
    await writeJson(join(project.configDir, 'pikku.config.json'), config)

    const result = await runAppNativeUpgrade(project, { name: 'web' })

    assert.equal(result.refusal, null)
    assert.ok(result.written.includes('Cargo.toml'))
    assert.match(
      await readFile(join(dir, 'Cargo.toml'), 'utf-8'),
      /tauri-plugin-dialog = "2"/
    )
  })

  test('refuses url and bundleServer together', async () => {
    const project = await newProject({
      web: {
        cwd: 'apps/web',
        native: {
          identifier: 'com.acme.web',
          platforms: ['desktop'],
          url: 'https://shop.example.com',
          bundleServer: true,
        },
      },
    })

    const result = await runAppNativeUpgrade(project, { name: 'web' })

    assert.match(result.refusal ?? '', /both "url" and "bundleServer"/)
  })
})

describe('runAppNativeCheck', () => {
  test('checks every native app when none is named', async () => {
    const project = await newProject({
      web: { cwd: 'apps/web' },
      admin: { cwd: 'apps/admin' },
      site: { cwd: 'apps/site' },
    })
    await runAppNativeInit(project, { name: 'web' })
    await runAppNativeInit(project, { name: 'admin' })

    const result = await runAppNativeCheck(project, {})

    assert.equal(result.refusal, null)
    assert.deepEqual(
      result.apps.map((app) => app.name),
      ['web', 'admin']
    )
    // Neither frontend was built, which is a warning and nothing more.
    assert.ok(
      result.apps.every((app) => app.problems.every((p) => p.level !== 'error'))
    )
  })

  test('reports two apps sharing an identifier', async () => {
    const shared = { identifier: 'com.acme.shop', platforms: ['desktop'] }
    const project = await newProject({
      web: { cwd: 'apps/web', native: shared },
      admin: { cwd: 'apps/admin', native: shared },
    })

    const result = await runAppNativeCheck(project, { name: 'web' })

    assert.ok(
      result.apps[0]!.problems.some((p) =>
        /also admin's identifier/.test(p.message)
      )
    )
  })

  test('reports a server-rendered frontend in bundle mode', async () => {
    const project = await newProject({
      web: {
        cwd: 'apps/web',
        kind: 'ssr',
        native: { identifier: 'com.acme.web', platforms: ['desktop'] },
      },
    })

    const result = await runAppNativeCheck(project, { name: 'web' })

    assert.ok(
      result.apps[0]!.problems.some(
        (p) => p.level === 'error' && /server-rendered/.test(p.message)
      )
    )
  })

  test('reports a native entry it cannot turn into a project', async () => {
    const project = await newProject({
      web: {
        cwd: 'apps/web',
        native: {
          identifier: 'com.acme.web',
          platforms: ['desktop'],
          url: 'https://shop.example.com',
          bundleServer: true,
        },
      },
    })

    const result = await runAppNativeCheck(project, {})

    assert.match(result.apps[0]!.problems[0]!.message, /both "url"/)
  })

  test('refuses an unknown frontend', async () => {
    const project = await newProject({ web: { cwd: 'apps/web' } })

    const result = await runAppNativeCheck(project, { name: 'mobile' })

    assert.match(result.refusal ?? '', /no frontend named "mobile"/)
  })
})

describe('runAppList', () => {
  test('lists each frontend with how it ships', async () => {
    const project = await newProject({
      web: { cwd: 'apps/web', kind: 'spa', serve: {} },
      desk: {
        cwd: 'apps/desk',
        native: {
          identifier: 'com.acme.desk',
          platforms: ['desktop'],
          bundleServer: true,
        },
      },
    })

    assert.deepEqual(runAppList(project).apps, [
      {
        name: 'web',
        cwd: 'apps/web',
        kind: 'spa',
        serves: null,
        servedAt: '/',
        native: null,
      },
      {
        name: 'desk',
        cwd: 'apps/desk',
        kind: null,
        serves: null,
        servedAt: null,
        native: {
          identifier: 'com.acme.desk',
          platforms: ['desktop'],
          mode: 'sidecar',
          plugins: [],
        },
      },
    ])
  })
})
