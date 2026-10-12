import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrandWorkspace } from './brand-workspace.js'

const workspace = (apps: string[]) => {
  const root = mkdtempSync(join(tmpdir(), 'brand-ws-'))
  for (const app of apps) {
    mkdirSync(join(root, app), { recursive: true })
    writeFileSync(join(root, app, 'vite.config.ts'), 'export default {}')
  }
  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'pkg', 'vite.config.ts'), '')
  return root
}

test('frontends are discovered by vite config, outside node_modules', () => {
  const ws = new BrandWorkspace(workspace(['apps/app', 'apps/portal']))
  assert.deepEqual(ws.frontends().map((f) => f.name), ['apps/app', 'apps/portal'])
  assert.equal(ws.frontend('portal').name, 'apps/portal')
  assert.throws(() => ws.frontend(), /pass --app/)
})

test('configured frontends win, and their primary is the default', () => {
  const root = workspace(['apps/app'])
  const ws = new BrandWorkspace(root, { frontends: { web: { cwd: 'apps/app', primary: true }, other: { cwd: 'apps/x' } } })
  assert.equal(ws.frontend().dir, join(root, 'apps/app'))
})

test('extract needs exactly one source', async () => {
  const ws = new BrandWorkspace(workspace(['apps/app']))
  await assert.rejects(ws.extract({}), /exactly one/)
  await assert.rejects(ws.extract({ url: 'a', file: 'b' }), /exactly one/)
})

test('extract from a tokens file returns a theme input', async () => {
  const root = workspace(['apps/app'])
  writeFileSync(join(root, 'tokens.json'), JSON.stringify({ primary: { $value: '#ff0000', $type: 'color' } }))
  const { profile, theme } = await new BrandWorkspace(root).extract({ file: 'tokens.json', preset: 'x' })
  assert.equal(profile.colors.primary, '#ff0000')
  assert.equal(theme.preset, 'x')
  assert.equal(theme.colors?.primary, '#ff0000')
})
