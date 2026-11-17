import assert from 'node:assert'
import { test } from 'node:test'
import {
  packageNamespace,
  serializePikkuPackages,
} from './pikku-package-passes.js'

const pkg = (entry: string, name: string) => ({
  entry,
  dir: `/r/${entry}`,
  name,
})

test('each package is wired under its directory name and exposes what it declares', () => {
  const out = serializePikkuPackages(
    [pkg('packages/a', '@x/a'), pkg('packages/b', '@x/b')],
    '/r/pikku.config.json'
  )
  assert.equal(packageNamespace(pkg('packages/a', '@x/a')), 'a')
  assert.match(
    out,
    /wireAddon\(\{ name: 'a', package: '@x\/a', expose: true \}\)/
  )
  assert.match(
    out,
    /wireAddon\(\{ name: 'b', package: '@x\/b', expose: true \}\)/
  )
})

test('two directories with the same name are refused', () => {
  assert.throws(
    () =>
      serializePikkuPackages(
        [pkg('one/a', '@x/a'), pkg('two/a', '@x/b')],
        '/r/pikku.config.json'
      ),
    /both be wired as 'a'/
  )
})
