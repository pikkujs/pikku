/**
 * What the Cloudflare Workers runtime offers a unit, per tier and compat date.
 *
 * The one place the compat date, the compat flags, the Node built-ins Workers
 * supplies, the ones the build stubs and the bundle externals are decided.
 * `wrangler-toml.ts`, `workers.ts` and the adapter all read from it.
 */

import type { RuntimeProfile, RuntimeTier } from '@pikku/deploy'

/** The date units are uploaded with unless the adapter is told otherwise. */
export const DEFAULT_COMPAT_DATE = '2024-12-18'

/** The tier Workers units run at today: `nodejs_compat` is on for every one. */
export const DEFAULT_CLOUDFLARE_TIER: RuntimeTier = 'serverless'

/**
 * Built-ins `nodejs_compat` provides on every compat date this adapter uploads
 * with. Bare names; a name covers its subpaths (`stream` covers `stream/web`).
 */
const NODEJS_COMPAT_BUILTINS = [
  'assert',
  'async_hooks',
  'buffer',
  'console',
  'constants',
  'crypto',
  'diagnostics_channel',
  'dns',
  'events',
  'module',
  'net',
  'path',
  'process',
  'querystring',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'zlib',
]

/**
 * Built-ins that exist only from a compat date onwards, with `nodejs_compat`.
 * Measured in workerd: `node:fs` and `node:os` are absent at 2024-12-18 and
 * 2025-09-01 and present from 2025-09-15, which is why a `node:os` import was
 * rejected at upload while the build had succeeded.
 */
const DATE_GATED_BUILTINS: Array<{ since: string; builtins: string[] }> = [
  { since: '2025-08-15', builtins: ['http', 'https'] },
  { since: '2025-09-15', builtins: ['os', 'fs', 'perf_hooks'] },
]

/**
 * Built-ins the build replaces with an empty module on every tier. Workers has
 * no `child_process`, and its `fs` (where present) is an in-memory VFS an app's
 * real file reads would silently miss.
 */
const STUBBED_BUILTINS = ['fs', 'fs/promises', 'child_process']

/** Built-ins Workers provides at `compatDate` under `nodejs_compat`. */
export function cloudflareBuiltinsFor(compatDate: string): string[] {
  const builtins = [...NODEJS_COMPAT_BUILTINS]
  for (const gate of DATE_GATED_BUILTINS) {
    if (compatDate >= gate.since) builtins.push(...gate.builtins)
  }
  return builtins.sort()
}

export function getCloudflareRuntimeProfile(
  tier: RuntimeTier = DEFAULT_CLOUDFLARE_TIER,
  compatDate: string = DEFAULT_COMPAT_DATE
): RuntimeProfile {
  if (tier === 'server') {
    throw new Error(
      'Cloudflare Workers has no server tier: a container unit is not a Worker.'
    )
  }
  // The edge tier is Web APIs only: no nodejs_compat, so no built-ins at all.
  const allowedBuiltins =
    tier === 'edge' ? [] : cloudflareBuiltinsFor(compatDate)
  return {
    tier,
    compatDate,
    compatFlags: tier === 'edge' ? [] : ['nodejs_compat_v2'],
    allowedBuiltins,
    stubbedBuiltins: STUBBED_BUILTINS,
    // A stubbed built-in must stay out of the externals: `external` is matched
    // ahead of an `onResolve` hook, so listing it would let the import through
    // before the stub plugin ever saw it.
    externals: [
      ...allowedBuiltins.flatMap((b) =>
        STUBBED_BUILTINS.includes(b) ? [] : [`node:${b}`, `node:${b}/*`]
      ),
      'cloudflare:*',
      'uWebSockets.js',
    ],
  }
}
