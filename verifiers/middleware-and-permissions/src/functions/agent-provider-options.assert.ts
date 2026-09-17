import { pikkuState } from '@pikku/core/state'

/**
 * `providerOptions` must survive compilation into `agentsMeta`.
 *
 * The runner reads it off the live agent object, so an in-process run honours
 * it whether or not the inspector saw it — which is why it went missing from
 * the generated metadata without anything failing. Everything that reads the
 * compiled meta instead (the console's agent view, `infra.json`) showed an
 * agent with no provider configuration at all.
 */
export function testAgentProviderOptionsMeta(): boolean {
  console.log('\nAgent providerOptions metadata')
  console.log('------------------------------')

  const agentsMeta = pikkuState(null, 'agent', 'agentsMeta')
  const meta = agentsMeta['testAgent']

  if (!meta) {
    console.log('  ✗ No metadata generated for testAgent')
    return false
  }

  const expected = {
    openai: { reasoningEffort: 'low' },
    anthropic: { thinking: { type: 'enabled', budgetTokens: 1024 } },
  }
  const actual = JSON.stringify(meta.providerOptions)

  if (actual !== JSON.stringify(expected)) {
    console.log(`  ✗ Expected ${JSON.stringify(expected)}, got ${actual}`)
    return false
  }

  console.log('  ✓ providerOptions reached agentsMeta intact')
  return true
}
