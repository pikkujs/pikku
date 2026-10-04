import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extensionFiles } from './new-extension.js'

test('the scaffold declares screens, so it is an extension and not an addon', () => {
  const files = extensionFiles('invoice-tracker')
  assert.match(files['src/extension.ts'], /defineExtension/)
  assert.match(files['src/extension.ts'], /title: 'Invoice Tracker'/)
  assert.match(files['src/extension.ts'], /scopes: \['invoice-tracker:read'\]/)
})

test('the screen scope is one the shipped function enforces', () => {
  const files = extensionFiles('invoice-tracker')
  assert.match(
    files['src/functions/hello.function.ts'],
    /scopes: \['invoice-tracker:read'\]/
  )
})

test('the package publishes the extension meta', () => {
  const pkg = JSON.parse(extensionFiles('x')['package.json'])
  assert.ok(pkg.exports['./.pikku/extension/*'])
  assert.equal(pkg.name, '@pikku/extension-x')
})
