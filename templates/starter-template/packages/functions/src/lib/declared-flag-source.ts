import type { DeclaredFlag } from '@pikku/core/flag'
import type { FeatureFlagSource } from '@pikku/core/services'
import { declaredFeatureFlags } from '#pikku/scopes/pikku-flags-manifest.gen.js'

/**
 * Tell a flag source which flags this app declares.
 *
 * The runtime injects a store-backed source where there is one — pikku dev's
 * KyselyFeatureFlagStore, a stage's own — and builds it before this app's code
 * is loaded, so it starts out knowing no declaration at all. The console's
 * Feature flags board reads the store's declared set, so without this it lists
 * nothing for an app that declares flags, and "Create missing rows" has nothing
 * to create a row for.
 *
 * The cast is the point rather than a workaround: `setDeclared` is protected
 * because it is meant to be called by whoever knows the declarations, and here
 * that is the app rather than the store it was handed. A source that does not
 * take declarations — a provider like PostHog, whose own UI owns them — simply
 * does not have the method, and is left alone.
 */
export function declareFlagsTo(source: FeatureFlagSource): void {
  const takesDeclarations = source as Partial<{
    setDeclared(declared: DeclaredFlag[]): void
  }>
  takesDeclarations.setDeclared?.(declaredFeatureFlags)
}
