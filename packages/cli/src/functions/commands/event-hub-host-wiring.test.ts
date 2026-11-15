import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')

// `pikku dev` and `pikku serve` are the hosts: the event hub distributor is
// created by them before the app's services exist, and re-attached after, so
// the runtime's hub always wins over anything the app returned.
for (const file of ['dev.ts', 'serve.ts']) {
  describe(`${file} wires the event hub distributor`, () => {
    const source = read(file)

    test('installs it before the services are created', () => {
      const installed = source.indexOf('installEventHubDistributor()')
      const created = source.indexOf('createLocalServices(')
      assert.ok(installed > -1, 'installEventHubDistributor() is not called')
      assert.ok(installed < created, 'it must come before createLocalServices')
    })

    test('hands services only the publisher and the registry', () => {
      assert.match(source, /services: eventHubServices/)
      assert.doesNotMatch(source, /createEventHub\(/)
    })

    test('re-attaches the runtime hub after the app services resolve', () => {
      const spreads = source.match(/\.\.\.eventHubServices/g) ?? []
      assert.equal(spreads.length, 2)
    })
  })
}
