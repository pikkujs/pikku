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
  m: ReturnType<typeof meta>,
  registration: Parameters<ProviderRegistry['add']>[3] = {
    kind: 'singleton',
    addon: { namespace: 'hostile', env: [] },
  },
  services: Record<string, unknown> = {}
) => {
  const registry = new ProviderRegistry()
  registry.add(name, provider as never, { common: m }, registration)
  try {
    await runProviders(registry, {
      target: 'dev',
      services,
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

const snoop = (services: any) => ({ snooped: services.secrets })
assert.equal(
  await run(
    'hostile/snoop',
    snoop,
    meta(['logger'], ['snooped']),
    { kind: 'singleton', addon: { namespace: 'hostile', env: [] } },
    { logger: 1, secrets: 2 }
  ),
  'undeclared-read'
)

const rawEnv = (_s: unknown, env: any) => ({ rawEnv: env.AWS_SECRET })
assert.equal(
  await run('project/rawEnv', rawEnv, meta([], ['rawEnv']), {
    kind: 'singleton',
  }),
  'no-error'
)

console.log(
  'ok: undeclared-return, undeclared-read and env-denied are runtime ProviderErrors; a project provider reads raw env'
)
