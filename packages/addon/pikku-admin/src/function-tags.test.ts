import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, test } from 'node:test'

const functionsDir = new URL('./functions/', import.meta.url)

const functionFiles = readdirSync(functionsDir).filter((name) =>
  name.endsWith('.function.ts')
)

// The code city draws one building per distinct tag combination, so every
// function names exactly one domain. The `admin:` prefix keeps these tags apart
// from the tags a consuming app uses for its own backend filters and middleware.
describe('admin addon function tags', () => {
  test('finds the functions', () => {
    assert.ok(functionFiles.length > 0)
  })

  for (const name of functionFiles) {
    test(`${name} carries one admin: domain tag`, () => {
      const source = readFileSync(new URL(name, functionsDir), 'utf8')
      const tags = [...source.matchAll(/^\s+tags: \[(.*)\],$/gm)]
      assert.equal(tags.length, 1, 'exactly one tags declaration')
      assert.match(tags[0]![1]!, /^'admin:[a-z0-9-]+'$/)
    })
  }
})
