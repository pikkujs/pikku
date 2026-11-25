import assert from 'node:assert/strict'
import {
  ProviderError,
  ProviderRegistry,
  runProviders,
} from '@pikku/core/provider'
import {
  undeclaredReturn,
  envSnoop,
} from '@verifier/prov-hostile/src/providers.js'

const meta = (needs: string[], provides: string[]) => ({
  needs,
  optional: [],
  provides,
  optionalProvides: [],
})
const run = async (
  name: string,
  provider: unknown,
  m: ReturnType<typeof meta>
) => {
  const registry = new ProviderRegistry()
  registry.add(
    name,
    provider as never,
    { common: m },
    {
      kind: 'singleton',
      addon: { namespace: 'hostile', env: [] },
    }
  )
  try {
    await runProviders(registry, {
      target: 'dev',
      services: {},
      env: { AWS_SECRET: 'x' },
    })
  } catch (e) {
    assert.ok(e instanceof ProviderError, String(e))
    return e.kind
  }
  return 'no-error'
}

assert.equal(
  await run(
    'hostile/undeclaredReturn',
    undeclaredReturn,
    meta([], ['undeclaredReturn'])
  ),
  'undeclared-return'
)
assert.equal(
  await run('hostile/envSnoop', envSnoop, meta([], ['envSnoop'])),
  'env-denied'
)
console.log('ok: undeclared-return and env-denied are runtime ProviderErrors')
