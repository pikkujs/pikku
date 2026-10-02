import { builtinModules } from 'node:module'
import type { RuntimeTier } from './runtime-tier.js'

/**
 * What a provider's runtime offers a unit at one tier, in one place.
 *
 * The flags the uploader sets, the compat date, the built-ins the platform
 * supplies and the verifier's bundle settings are all derived from this, so they
 * cannot drift apart the way separately maintained constants do.
 */
export interface RuntimeProfile {
  /** The tier this profile describes. */
  tier: RuntimeTier
  /** The provider's compatibility date (empty when it has no such concept). */
  compatDate: string
  /** Flags the provider must be given for this tier (`nodejs_compat_v2`, ...). */
  compatFlags: string[]
  /**
   * Node built-ins the runtime provides at this tier and date, bare names
   * (`crypto`, `fs/promises`). Empty at the edge tier.
   */
  allowedBuiltins: string[]
  /**
   * Built-ins the build replaces with an empty module. They are not provided at
   * runtime, so a bundle may import them only because the import is dead; the
   * verifier reports them as warnings instead of failing.
   */
  stubbedBuiltins: string[]
  /** esbuild externals the provider's bundle leaves for the runtime to resolve. */
  externals: string[]
}

/** Strip the `node:` prefix: `node:fs/promises` -> `fs/promises`. */
export const bareBuiltinName = (specifier: string): string =>
  specifier.startsWith('node:') ? specifier.slice(5) : specifier

const BUILTIN_SET = new Set(builtinModules)

/** Whether `specifier` names a Node built-in, with or without `node:`. */
export function isNodeBuiltin(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true
  return BUILTIN_SET.has(specifier)
}

/** Whether the profile's runtime provides `specifier` (`fs`, `node:fs`, ...). */
export function isBuiltinAllowed(
  profile: Pick<RuntimeProfile, 'allowedBuiltins'>,
  specifier: string
): boolean {
  const name = bareBuiltinName(specifier)
  const root = name.split('/')[0]!
  return profile.allowedBuiltins.some((b) => b === name || b === root)
}

/** Whether the profile replaces `specifier` with an empty module. */
export function isBuiltinStubbed(
  profile: Pick<RuntimeProfile, 'stubbedBuiltins'>,
  specifier: string
): boolean {
  const name = bareBuiltinName(specifier)
  return profile.stubbedBuiltins.some((b) => b === name)
}
