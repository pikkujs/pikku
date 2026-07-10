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

test('two Slack nodes with different creds → two encapsulated instances; same cred deduped', () => {
  const parsed = parseN8n(loadFixture('two-slack-creds.json'))
  const instances = deriveCredentialInstances(parsed)

  // Slack — Marketing (used twice) + Slack — Support = 2 distinct instances
  assert.equal(instances.length, 2)

  const marketing = instances.find((i) => i.instanceName === 'slack-marketing')
  const support = instances.find((i) => i.instanceName === 'slack-support')
  assert.ok(marketing, 'marketing instance derived')
  assert.ok(support, 'support instance derived')

  // both instances are the same addon package, different credential bindings
  assert.equal(marketing!.package, '@pikku/addon-slack')
  assert.equal(support!.package, '@pikku/addon-slack')
  assert.notEqual(marketing!.credentialName, support!.credentialName)

  // the two nodes bound to "Slack — Marketing" collapse into one instance
  assert.deepEqual(marketing!.nodeRpcNames.sort(), [
    'slack__notifyMarketing',
    'slack__notifyMarketingAgain',
  ])
  assert.deepEqual(support!.nodeRpcNames, ['slack__notifySupport'])
})

test('generateWorkflowFromN8n emits wireAddon instances + records per-node binding', () => {
  const parsed = parseN8n(loadFixture('two-slack-creds.json'))
  const { files, manifest, credentialInstances } =
    generateWorkflowFromN8n(parsed)

  assert.equal(credentialInstances.length, 2)

  const addons = files['dualSlackNotify/dualSlackNotify.addons.gen.ts']
  assert.ok(addons, 'addons wiring file emitted')
  assert.match(addons, /import \{ wireAddon \} from '@pikku\/core\/rpc'/)
  // one wireAddon per credential instance, same package, distinct names + creds
  assert.match(addons, /name: "slack-marketing"/)
  assert.match(addons, /name: "slack-support"/)
  assert.match(addons, /package: "@pikku\/addon-slack"/)
  assert.match(addons, /credentialOverrides: \{ "slack": "slack-marketing" \}/)

  // manifest entries carry which instance each node binds
  const mkt = manifest.find((m) => m.rpcName === 'slack__notifyMarketing')
  const sup = manifest.find((m) => m.rpcName === 'slack__notifySupport')
  assert.equal(mkt!.credentialInstance, 'slack-marketing')
  assert.equal(sup!.credentialInstance, 'slack-support')
})
