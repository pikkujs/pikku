import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as entry from './index.js'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(
  readFileSync(resolve(here, '../package.json'), 'utf8')
) as { exports: Record<string, string | Record<string, string>> }

test('the entry point exports the shell the package documents', () => {
  for (const name of [
    'Shell',
    'ShellRow',
    'Stage',
    'Panel',
    'TabBar',
    'Sheet',
    'usePhone',
    'useMediaQuery',
    'MOBILE_QUERY',
  ]) {
    assert.ok(name in entry, `${name} is not exported from the package entry`)
  }
  assert.equal(entry.MOBILE_QUERY, '(max-width: 48em)')
})

test('the css entry points at a stylesheet the source ships', () => {
  assert.equal(manifest.exports['./shell.css'], './dist/shell.css')
  assert.ok(existsSync(resolve(here, 'shell.css')), 'src/shell.css is missing')
})
