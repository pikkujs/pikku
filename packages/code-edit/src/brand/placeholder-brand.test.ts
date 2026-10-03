import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { placeholderBrands, productBrand } from './placeholder-brand.js'

const project = (opts: { appName?: string; title?: string; emailName?: string }) => {
  const repo = mkdtempSync(join(tmpdir(), 'brand-'))
  const dir = join(repo, 'apps', 'app')
  mkdirSync(join(dir, 'messages'), { recursive: true })
  mkdirSync(join(dir, 'src', 'routes'), { recursive: true })
  mkdirSync(join(repo, 'emails'), { recursive: true })
  writeFileSync(join(dir, 'messages', 'en.json'), JSON.stringify({ app__name: opts.appName }))
  writeFileSync(join(dir, 'src', 'routes', '__root.tsx'), `export const meta = [{ title: '${opts.title}' }]`)
  writeFileSync(join(repo, 'emails', 'theme.json'), JSON.stringify({ appName: opts.emailName }))
  return { repo, apps: [{ slug: 'app', dir }] }
}

const addApp = (repo: string, slug: string, appName: string) => {
  const dir = join(repo, 'apps', slug)
  mkdirSync(join(dir, 'messages'), { recursive: true })
  writeFileSync(join(dir, 'messages', 'en.json'), JSON.stringify({ app__name: appName }))
  return { slug, dir }
}

const branded = { appName: 'Spoke & Sprocket', title: 'Spoke & Sprocket', emailName: 'Spoke & Sprocket' }

test('the template as it ships is placeholder everywhere', () => {
  const { repo, apps } = project({ appName: 'Fabric Starter', title: 'Pikku App', emailName: 'Pikku Starter' })
  assert.deepEqual(
    placeholderBrands(repo, apps).map((f) => f.where),
    ['apps/app/messages/en.json', 'apps/app/src/routes/__root.tsx', 'emails/theme.json']
  )
})

test('a renamed app reports nothing', () => {
  const { repo, apps } = project(branded)
  assert.deepEqual(placeholderBrands(repo, apps), [])
})

test('renaming the wordmark but not the tab still reports the tab', () => {
  const { repo, apps } = project({ ...branded, title: 'Pikku App' })
  const found = placeholderBrands(repo, apps)
  assert.equal(found.length, 1)
  assert.equal(found[0]!.where, 'apps/app/src/routes/__root.tsx')
})

test('a second app is checked on its own', () => {
  const { repo, apps } = project(branded)
  const found = placeholderBrands(repo, [...apps, addApp(repo, 'portal', 'Pikku Starter')])
  assert.equal(found.length, 1)
  assert.equal(found[0]!.where, 'apps/portal/messages/en.json')
})

test('a project with no emails or routes reports only what it has', () => {
  const repo = mkdtempSync(join(tmpdir(), 'brand-'))
  assert.equal(placeholderBrands(repo, [addApp(repo, 'app', 'Fabric Starter')]).length, 1)
})

test('an app named after its own slug is not a brand either', () => {
  const { repo, apps } = project(branded)
  const found = placeholderBrands(repo, [...apps, addApp(repo, 'portal', 'Portal')])
  assert.equal(found.length, 1)
  assert.equal(found[0]!.found, 'Portal')
})

test('the product name comes from the first app that has a real one', () => {
  const { repo, apps } = project(branded)
  assert.equal(productBrand([addApp(repo, 'portal', 'Portal'), ...apps]), 'Spoke & Sprocket')
})

test('an unbranded project has no product name', () => {
  const { apps } = project({ appName: 'Fabric Starter', title: 'x', emailName: 'x' })
  assert.equal(productBrand(apps), null)
})

test('the tab name is read from app-meta.ts once the app has one', () => {
  const { repo, apps } = project({ appName: 'Ledgerly', title: 'Ledgerly', emailName: 'Ledgerly' })
  writeFileSync(join(apps[0]!.dir, 'src', 'app-meta.ts'), `export const appMeta = [{ title: 'Pikku App' }]`)
  assert.deepEqual(
    placeholderBrands(repo, apps).map((f) => f.where),
    ['apps/app/src/app-meta.ts']
  )
})
