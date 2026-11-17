import assert from 'node:assert'
import { test } from 'node:test'
import { serializePikkuPackages } from './pikku-package-passes.js'

const pkg = (entry: string, name: string, namespace: string) => ({
  entry,
  dir: `/r/${entry}`,
  name,
  namespace,
})

test('each package is wired under its declared namespace and exposes what it declares', () => {
  const out = serializePikkuPackages([
    pkg('packages/a', '@x/a', 'billing'),
    pkg('packages/b', '@x/b', 'shared'),
  ])
  assert.match(
    out,
    /wireAddon\(\{ name: 'billing', package: '@x\/a', expose: true \}\)/
  )
  assert.match(
    out,
    /wireAddon\(\{ name: 'shared', package: '@x\/b', expose: true \}\)/
  )
})
