import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseN8n } from './parse-n8n.js'
import { deriveCredentialInstances } from './credentials.js'
import { generateWorkflowFromN8n } from './codegen.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures')
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'))

test('two Pipedrive nodes with different creds → two encapsulated instances; same cred deduped', () => {
  // Pipedrive has no addon and is NOT in the integration-map, so its nodes stay
  // stubs and keep their per-node rpc names — the clean case for exercising
  // credential derivation in isolation from native mapping.
  const parsed = parseN8n(loadFixture('two-pipedrive-creds.json'))
  const instances = deriveCredentialInstances(parsed)

  // Pipedrive — Marketing (used twice) + Pipedrive — Support = 2 distinct instances
  assert.equal(instances.length, 2)

  const marketing = instances.find(
    (i) => i.instanceName === 'pipedrive-marketing'
  )
  const support = instances.find((i) => i.instanceName === 'pipedrive-support')
  assert.ok(marketing, 'marketing instance derived')
  assert.ok(support, 'support instance derived')

  // both instances are the same addon package, different credential bindings
  assert.equal(marketing!.package, '@pikku/addon-pipedrive')
  assert.equal(support!.package, '@pikku/addon-pipedrive')
  assert.notEqual(marketing!.credentialName, support!.credentialName)

  // the two nodes bound to "Pipedrive — Marketing" collapse into one instance
  assert.deepEqual(marketing!.nodeRpcNames.sort(), [
    'pipedrive__createMarketing',
    'pipedrive__createMarketingAgain',
  ])
  assert.deepEqual(support!.nodeRpcNames, ['pipedrive__createSupport'])
})

test('generateWorkflowFromN8n emits wireAddon instances + records per-node binding', () => {
  const parsed = parseN8n(loadFixture('two-pipedrive-creds.json'))
  const { files, manifest, credentialInstances } =
    generateWorkflowFromN8n(parsed)

  assert.equal(credentialInstances.length, 2)

  const addons = files['dualPipedriveSync/dualPipedriveSync.addons.gen.ts']
  assert.ok(addons, 'addons wiring file emitted')
  assert.match(addons, /import \{ wireAddon \} from '@pikku\/core\/rpc'/)
  // one wireAddon per credential instance, same package, distinct names + creds
  assert.match(addons, /name: "pipedrive-marketing"/)
  assert.match(addons, /name: "pipedrive-support"/)
  assert.match(addons, /package: "@pikku\/addon-pipedrive"/)
  assert.match(
    addons,
    /credentialOverrides: \{ "pipedrive": "pipedrive-marketing" \}/
  )

  // manifest entries carry which instance each node binds
  const mkt = manifest.find((m) => m.rpcName === 'pipedrive__createMarketing')
  const sup = manifest.find((m) => m.rpcName === 'pipedrive__createSupport')
  assert.equal(mkt!.credentialInstance, 'pipedrive-marketing')
  assert.equal(sup!.credentialInstance, 'pipedrive-support')
})

test('mapped service suppresses per-credential wireAddon blocks in favour of the plain mapped instance', () => {
  // Slack IS in the integration-map, so all three nodes emit the single mapped
  // namespace (`slack:chatPostMessage`). The forward-looking per-credential
  // override blocks would then be orphaned (no node calls them) and target
  // credentials that don't exist yet — so they're dropped, and only the plain
  // mapped `wireAddon` remains. Multi-account per-credential namespacing for
  // mapped services is a separate, not-yet-built feature.
  const parsed = parseN8n(loadFixture('two-slack-creds.json'))
  const { files } = generateWorkflowFromN8n(parsed)

  const graph = files['dualSlackNotify/dualSlackNotify.graph.ts']
  assert.match(graph, /notifyMarketing: "slack:chatPostMessage"/)

  const addons = files['dualSlackNotify/dualSlackNotify.addons.gen.ts']
  assert.ok(addons, 'addons wiring file emitted')
  // the plain mapped instance is present so the graph's rpcs resolve
  assert.match(addons, /name: "slack"/)
  assert.match(addons, /package: "@pikku\/addon-slack"/)
  // no orphaned per-credential override blocks for the mapped package
  assert.doesNotMatch(addons, /name: "slack-marketing"/)
  assert.doesNotMatch(addons, /credentialOverrides/)
})
