import assert from 'node:assert'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { runPlaceholderBrandChecks } from './placeholder-brand-checks.js'
import { planValidation } from './validate-registry.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

const addApp = (
  repo: string,
  slug: string,
  appName: string,
  primary = false
) => {
  const dir = join(repo, 'apps', slug)
  mkdirSync(join(dir, 'messages'), { recursive: true })
  writeFileSync(join(dir, 'vite.config.ts'), 'export default {}')
  writeFileSync(
    join(dir, 'messages', 'en.json'),
    JSON.stringify({ app__name: appName })
  )
  return { slug, dir, primary }
}

const project = (opts: {
  appName?: string
  title?: string
  emailName?: string
}) => {
  const repo = mkdtempSync(join(tmpdir(), 'brand-'))
  roots.push(repo)
  const { dir } = addApp(repo, 'app', opts.appName ?? '')
  mkdirSync(join(dir, 'src', 'routes'), { recursive: true })
  mkdirSync(join(repo, 'emails'), { recursive: true })
  writeFileSync(
    join(dir, 'src', 'routes', '__root.tsx'),
    `export const meta = [{ title: '${opts.title}' }]`
  )
  writeFileSync(
    join(repo, 'emails', 'theme.json'),
    JSON.stringify({ appName: opts.emailName })
  )
  writeFileSync(join(repo, 'pikku.config.json'), '{}')
  writeFileSync(join(repo, 'package.json'), '{"name":"app"}')
  return { repo, dir }
}

const branded = {
  appName: 'Spoke & Sprocket',
  title: 'Spoke & Sprocket',
  emailName: 'Spoke & Sprocket',
}

const wheres = (repo: string) =>
  runPlaceholderBrandChecks(repo).map((f) => f.path.slice(repo.length + 1))

describe('validate and placeholder brand', () => {
  test('the template as it ships is placeholder everywhere', () => {
    const { repo } = project({
      appName: 'Fabric Starter',
      title: 'Pikku App',
      emailName: 'Pikku Starter',
    })
    assert.deepStrictEqual(wheres(repo), [
      'apps/app/messages/en.json',
      'apps/app/src/routes/__root.tsx',
      'emails/theme.json',
    ])
    assert.deepStrictEqual(
      runPlaceholderBrandChecks(repo).map((f) => [f.id, f.severity]),
      [
        ['placeholder-brand-name', 'warn'],
        ['placeholder-brand-title', 'warn'],
        ['placeholder-brand-email', 'warn'],
      ]
    )
  })

  test('a renamed app reports nothing', () => {
    const { repo } = project(branded)
    assert.deepStrictEqual(runPlaceholderBrandChecks(repo), [])
  })

  test('renaming the wordmark but not the tab still reports the tab', () => {
    const { repo } = project({ ...branded, title: 'Pikku App' })
    assert.deepStrictEqual(wheres(repo), ['apps/app/src/routes/__root.tsx'])
  })

  test('a second app is checked on its own', () => {
    const { repo } = project(branded)
    addApp(repo, 'portal', 'Pikku Starter')
    assert.deepStrictEqual(wheres(repo), ['apps/portal/messages/en.json'])
  })

  test('a project with no emails or routes reports only what it has', () => {
    const repo = mkdtempSync(join(tmpdir(), 'brand-'))
    roots.push(repo)
    addApp(repo, 'app', 'Fabric Starter')
    assert.strictEqual(runPlaceholderBrandChecks(repo).length, 1)
  })

  test('an app named after its own slug is not a brand either', () => {
    const { repo } = project(branded)
    addApp(repo, 'portal', 'Portal')
    const found = runPlaceholderBrandChecks(repo)
    assert.strictEqual(found.length, 1)
    assert.ok(found[0]!.message.includes('"Portal"'))
  })

  test('the tab name is read from app-meta.ts once the app has one', () => {
    const { repo, dir } = project({
      appName: 'Ledgerly',
      title: 'Ledgerly',
      emailName: 'Ledgerly',
    })
    writeFileSync(
      join(dir, 'src', 'app-meta.ts'),
      `export const appMeta = [{ title: 'Pikku App' }]`
    )
    assert.deepStrictEqual(wheres(repo), ['apps/app/src/app-meta.ts'])
  })

  test('the check is planned for a project with a frontend', async () => {
    const { repo } = project(branded)
    const planned = (await planValidation(repo)).map((p) => p.check.id)
    assert.ok(planned.includes('placeholder-brand'))
  })

  test('a project with no frontend and no emails is not planned', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'brand-'))
    roots.push(repo)
    writeFileSync(join(repo, 'pikku.config.json'), '{}')
    writeFileSync(join(repo, 'package.json'), '{"name":"app"}')
    const planned = (await planValidation(repo)).map((p) => p.check.id)
    assert.ok(!planned.includes('placeholder-brand'))
  })
})
