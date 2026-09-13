/**
 * Verifies feature flags end-to-end against real generated code: compile-time
 * narrowing of `featureFlag` to the generated FeatureFlagName union, the
 * generated flag set and fallback, the runtime gate inside the function runner,
 * and the parts of the FeatureFlagStore contract a store cannot opt out of.
 */

import * as assert from 'node:assert'
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'
import { runPikkuFunc } from '@pikku/core/function'
import { resolveFlag, resolveFlagForClient, bucketOf } from '@pikku/core/flag'
import { FeatureUnavailableError } from '@pikku/core/errors'
import { MissingScopeError } from '#pikku/error'
import {
  createConfig,
  createSingletonServices,
  createWireServices,
  featureFlags,
} from './services.js'
import { RemoteFlagSource } from './remote-source.js'
import '../.pikku/pikku-bootstrap.gen.js'
import type { FeatureFlagName } from '#pikku/scopes'
import {
  FEATURE_FLAGS,
  FEATURE_FLAGS_META,
  FEATURE_FLAGS_FALLBACK,
} from '#pikku/scopes'

// ============================================================================
// Compile-time assertions — an undeclared flag must not type-check
// ============================================================================

void pikkuFunc<void, string>({
  // @ts-expect-error - typo: the declared flag is 'sandboxes'
  featureFlag: 'sandboxs',
  func: async () => 'x',
})

void pikkuFunc<void, string>({
  // @ts-expect-error - 'billing' is a scope tree, not a declared flag
  featureFlag: 'billing',
  func: async () => 'x',
})

void pikkuSessionlessFunc<void, string>({
  // @ts-expect-error - the union applies to sessionless functions too
  featureFlag: 'nightly-reindex',
  func: async () => 'x',
})

// A flag is singular: there is no set of flags to AND or OR together.
void pikkuFunc<void, string>({
  // @ts-expect-error - `featureFlag` takes one name, not a list
  featureFlag: ['sandboxes'],
  func: async () => 'x',
})

void ('sandboxes' satisfies FeatureFlagName)
void ('nightlyReindex' satisfies FeatureFlagName)

// ============================================================================
// Codegen
// ============================================================================

assert.deepEqual(
  FEATURE_FLAGS.map((flag) => flag.name).sort(),
  ['nightlyReindex', 'sandboxes'],
  'every declared flag must survive codegen'
)

assert.equal(
  FEATURE_FLAGS_META['sandboxes']!.description,
  'The sandbox workspace',
  'descriptions must survive codegen'
)
assert.deepEqual(
  FEATURE_FLAGS_META['sandboxes']!.anyOf,
  ['sandboxes:read', 'sandboxes:admin'],
  'anyOf must survive codegen'
)
assert.equal(
  FEATURE_FLAGS_META['nightlyReindex']!.anyOf,
  undefined,
  'a flag with no capability constraint must not gain one'
)

// The compiled fallback is every declared flag on: a store that cannot be read
// must not take the product down with it.
assert.deepEqual(FEATURE_FLAGS_FALLBACK['sandboxes'], {
  enabled: true,
  rolloutPercent: null,
  overrides: {},
})

// ============================================================================
// The runner gate
// ============================================================================

const config = await createConfig()
const singletonServices = await createSingletonServices(config)

const invoke = (
  name: string,
  session?: { userId: string; scopes?: string[]; orgId?: string }
) =>
  runPikkuFunc('rpc', name, name, {
    singletonServices,
    createWireServices,
    data: () => undefined,
    wire: { session },
  } as any)

const reader = { userId: 'u1', orgId: 'acme', scopes: ['sandboxes:read'] }

await featureFlags.syncFlags(FEATURE_FLAGS)

// A newly declared flag registers off — a dark launch, not a deploy that ships
// the feature to everyone the moment the declaration lands.
assert.deepEqual(
  (await featureFlags.listFlags()).map((row) => [row.name, row.enabled]).sort(),
  [
    ['nightlyReindex', false],
    ['sandboxes', false],
  ],
  'syncFlags must register a new flag off'
)

await assert.rejects(
  () => invoke('openSandbox', reader),
  FeatureUnavailableError,
  'a function behind an off flag must be unavailable'
)

// 503, not 403: the caller was allowed, the feature was not on.
await assert.rejects(
  () => invoke('openSandbox', reader),
  (err: FeatureUnavailableError) => {
    assert.equal(err.payload.feature, 'sandboxes')
    return true
  }
)

// The kill switch reaches background work, which has no session at all.
await assert.rejects(
  () => invoke('nightlyReindex'),
  FeatureUnavailableError,
  'a sessionless function must honour its flag'
)

// An unflagged function is untouched by any of this.
assert.equal(await invoke('unflagged', reader), 'open')

await featureFlags.setEnabled('sandboxes', true)
assert.equal(await invoke('openSandbox', reader), 'sandbox')

await featureFlags.setEnabled('nightlyReindex', true)
assert.equal(await invoke('nightlyReindex'), 'reindexed')

// The gate is availability only. A caller who lacks the scope is refused by
// `scopes:` — the flag is not a second authorization path that could disagree
// with it, in either direction.
await assert.rejects(
  () => invoke('openSandbox', { userId: 'u2', scopes: [] }),
  MissingScopeError,
  'an on flag must not admit a caller who lacks the scope'
)

// And the reverse: widening a flag cannot let anyone past `scopes:`. The
// function with no scopes of its own is open to a scopeless caller while the
// flag is on, and closed to everyone the moment it is off.
assert.equal(
  await invoke('unscopedSandbox', { userId: 'u2', scopes: [] }),
  'sandbox'
)
await featureFlags.setEnabled('sandboxes', false)
await assert.rejects(
  () => invoke('unscopedSandbox', reader),
  FeatureUnavailableError,
  'killing a flag closes it for everyone, whatever they hold'
)

// An override wins over the switch, which is the original ask: off for
// everyone, on for these organizations.
await featureFlags.setOverride('sandboxes', { organizationId: 'acme' }, true)
assert.equal(await invoke('openSandbox', reader), 'sandbox')
await assert.rejects(
  () => invoke('openSandbox', { ...reader, orgId: 'other' }),
  FeatureUnavailableError,
  'an override admits the named subject and nobody else'
)

// And in the other direction: a single tenant excluded from a live feature.
await featureFlags.setEnabled('sandboxes', true)
await featureFlags.setOverride('sandboxes', { organizationId: 'acme' }, false)
await assert.rejects(
  () => invoke('openSandbox', reader),
  FeatureUnavailableError,
  'an override must be able to exclude as well as admit'
)
await featureFlags.clearOverride('sandboxes', { organizationId: 'acme' })
assert.equal(await invoke('openSandbox', reader), 'sandbox')

// ============================================================================
// Resolution — the two booleans, and the bucket
// ============================================================================

const snapshot = await featureFlags.snapshot()
const anyOf = FEATURE_FLAGS_META['sandboxes']!.anyOf

// Availability and capability are independent, and `show` is the AND.
assert.deepEqual(resolveFlagForClient('sandboxes', anyOf, reader, snapshot), {
  available: true,
  capable: true,
  show: true,
})
assert.deepEqual(
  resolveFlagForClient(
    'sandboxes',
    anyOf,
    { userId: 'u2', scopes: [] },
    snapshot
  ),
  { available: true, capable: false, show: false },
  'an uncapable caller sees an available feature, and is shown nothing'
)

// anyOf is OR, deliberately the opposite of `scopes:`.
assert.equal(
  resolveFlag(
    'sandboxes',
    anyOf,
    { userId: 'u3', scopes: ['sandboxes:admin'] },
    snapshot
  ).capable,
  true,
  'anyOf is satisfied by any one of its scopes'
)

// A flag absent from the snapshot fails open on availability.
assert.deepEqual(resolveFlag('neverHeardOfIt', undefined, reader, {}), {
  available: true,
  capable: true,
})

await featureFlags.setRollout('sandboxes', 0)
assert.equal(
  resolveFlag('sandboxes', anyOf, reader, await featureFlags.snapshot())
    .available,
  false,
  'a 0% rollout admits nobody'
)

// ...but a caller with no subject to hash skips the bucket rather than failing
// it: a percentage is a statement about users, and background work is either on
// or off.
assert.equal(
  resolveFlag('sandboxes', undefined, undefined, await featureFlags.snapshot())
    .available,
  true,
  'no subject must skip the bucket, not fail it'
)

await featureFlags.setRollout('sandboxes', 100)
assert.equal(
  resolveFlag('sandboxes', anyOf, reader, await featureFlags.snapshot())
    .available,
  true,
  'a 100% rollout admits everybody'
)

// The bucket is stable for a subject and salted by flag, so two flags at the
// same percentage do not select the same half.
assert.equal(bucketOf('sandboxes', 'acme'), bucketOf('sandboxes', 'acme'))
assert.notEqual(
  bucketOf('sandboxes', 'acme'),
  bucketOf('nightlyReindex', 'acme')
)

await assert.rejects(
  () => featureFlags.setRollout('sandboxes', 101),
  'a rollout outside 0-100 must be refused'
)
await featureFlags.setRollout('sandboxes', null)

// ============================================================================
// Store contract — the declaration lifecycle
// ============================================================================

// A re-sync never re-enables a killed flag, and never touches a rollout or an
// override. A deploy is not an operator.
await featureFlags.setEnabled('nightlyReindex', false)
await featureFlags.setRollout('sandboxes', 25)
await featureFlags.setOverride('sandboxes', { organizationId: 'acme' }, true)
await featureFlags.syncFlags(FEATURE_FLAGS)

const afterResync = await featureFlags.listFlags()
assert.equal(
  afterResync.find((row) => row.name === 'nightlyReindex')!.enabled,
  false,
  'a re-sync must not re-enable a killed flag'
)
assert.equal(
  afterResync.find((row) => row.name === 'sandboxes')!.rolloutPercent,
  25,
  'a re-sync must not reset a rollout'
)
assert.equal(
  (await featureFlags.snapshot())['sandboxes']!.overrides['acme'],
  true,
  'a re-sync must not drop an override'
)

// Removing a declaration marks the row; it does not switch a feature off on
// deploy. Pruning is the only removal.
await featureFlags.syncFlags(
  FEATURE_FLAGS.filter((flag) => flag.name !== 'nightlyReindex')
)
assert.deepEqual(await featureFlags.findStaleFlags(), ['nightlyReindex'])
assert.equal(
  (await featureFlags.listFlags()).some((row) => row.name === 'nightlyReindex'),
  true,
  'an undeclared flag stays in the store, marked'
)

assert.deepEqual(await featureFlags.pruneFlags(), ['nightlyReindex'])
assert.deepEqual(await featureFlags.findStaleFlags(), [])
assert.equal(
  (await featureFlags.snapshot())['nightlyReindex'],
  undefined,
  'pruning removes the row and its overrides'
)

// ============================================================================
// A read-only source — what a third-party provider implements
// ============================================================================

const remote = new RemoteFlagSource({ ttlMs: 0, declared: FEATURE_FLAGS })
const remoteServices = { ...singletonServices, featureFlags: remote }

const invokeRemote = (
  name: string,
  session?: { userId: string; scopes?: string[]; orgId?: string }
) =>
  runPikkuFunc('rpc', name, name, {
    singletonServices: remoteServices,
    createWireServices,
    data: () => undefined,
    wire: { session },
  } as any)

// The gate reads `snapshot()` and nothing else, so a source with no write half
// drives it exactly as a store does.
remote.served = {
  sandboxes: { enabled: false, rolloutPercent: null, overrides: {} },
}
await assert.rejects(
  () => invokeRemote('openSandbox', reader),
  FeatureUnavailableError,
  'a read-only source must be able to close a flag'
)

remote.served = {
  sandboxes: { enabled: true, rolloutPercent: null, overrides: {} },
}
assert.equal(await invokeRemote('openSandbox', reader), 'sandbox')

// The middle layer. A provider that starts failing must leave the last good
// read standing — dropping to the compiled fallback would switch a deliberately
// dark flag on at the worst possible moment, when nobody can reach the console
// to switch it back off.
remote.served = {
  sandboxes: { enabled: false, rolloutPercent: null, overrides: {} },
}
await assert.rejects(
  () => invokeRemote('openSandbox', reader),
  FeatureUnavailableError
)
remote.failing = true
await assert.rejects(
  () => invokeRemote('openSandbox', reader),
  FeatureUnavailableError,
  'an unreachable provider must serve the last good read, not the compiled fallback'
)

// Only a cold start with no read to fall back on reaches the compiled
// declaration, where every flag is on: there is nothing better to say, and
// taking the product down is worse than shipping it.
const coldRemote = new RemoteFlagSource({ ttlMs: 0, declared: FEATURE_FLAGS })
coldRemote.failing = true
assert.equal(
  await runPikkuFunc('rpc', 'openSandbox', 'openSandbox', {
    singletonServices: { ...singletonServices, featureFlags: coldRemote },
    createWireServices,
    data: () => undefined,
    wire: { session: reader },
  } as any),
  'sandbox',
  'a cold start that never managed a read must fail open'
)

console.log('✓ flags: codegen, compile-time narrowing, and the runner gate')
console.log(
  '✓ flags: availability vs capability, overrides and rollout buckets'
)
console.log('✓ flags: dark-launch defaults, additive syncs and pruning')
console.log('✓ flags: a read-only source, and the three fail-open layers')
