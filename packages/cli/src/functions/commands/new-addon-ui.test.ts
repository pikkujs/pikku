import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addonUiFiles } from './new-addon-ui.js'

test('the scaffold declares screens, so the host can mount them', () => {
  const files = addonUiFiles('invoice-tracker')
  assert.match(files['src/screens.ts'], /definePlugin/)
  assert.doesNotMatch(files['src/screens.ts'], /defineScreens/)
  assert.match(files['src/screens.ts'], /title: 'invoice_tracker__title'/)
  assert.match(files['src/screens.ts'], /scope: 'project'/)
  assert.match(files['src/screens.ts'], /scopes: \['invoice-tracker:read'\]/)
})

test('every title is a key in the en catalog, which pikku all insists on', () => {
  const files = addonUiFiles('invoice-tracker')
  const en = JSON.parse(files['messages/en.json'])
  for (const [, key] of files['src/screens.ts'].matchAll(/title: '([^']+)'/g)) {
    assert.ok(en[key], `messages/en.json is missing ${key}`)
  }
  assert.ok(JSON.parse(files['package.json']).files.includes('messages'))
})

test('the screen scope is one the shipped function enforces', () => {
  const files = addonUiFiles('invoice-tracker')
  assert.match(
    files['src/functions/hello.function.ts'],
    /scopes: \['invoice-tracker:read'\]/
  )
})

test('the package publishes its screens through the addon exports', () => {
  const pkg = JSON.parse(addonUiFiles('x')['package.json'])
  assert.ok(pkg.exports['./.pikku/*'])
  assert.equal(pkg.name, '@pikku/addon-x')
})

test('the scope its screen and function require is declared, which the inspector insists on', () => {
  const files = addonUiFiles('invoice-tracker')
  assert.match(files['src/scopes.ts'], /defineScope/)
  assert.match(files['src/scopes.ts'], /'invoice-tracker': \{/)
  assert.match(files['src/scopes.ts'], /read: \{/)
  assert.match(files['src/index.ts'], /import '\.\/scopes\.js'/)
})

test('the scaffold declares the services types and factory pikku all requires', () => {
  const files = addonUiFiles('invoice-tracker')
  assert.match(
    files['types/application-types.d.ts'],
    /interface SingletonServices/
  )
  assert.match(files['src/services.ts'], /pikkuAddonServices/)
  assert.match(
    files['src/functions/hello.function.ts'],
    /#pikku\/addon\/function/
  )
})
