/**
 * The switches this app ships behind.
 *
 * `assistantPanel` is a PLACEHOLDER so the Flags screen has something to show
 * on a fresh project. REPLACE it with this app's real flags.
 *
 * Codegen builds a `FeatureFlagName` union from these declarations, because in a
 * browser a typo'd flag reads `false`, hides its feature permanently, and leaves
 * every test and screenshot green.
 *
 * Put `featureFlag: 'name'` on the function, and read it in a screen with
 * `useFlag('name')` (lib/product.ts). Hiding the screen alone leaves the feature
 * callable.
 */
import { defineFeatureFlags } from '#pikku/scopes'

defineFeatureFlags({
  assistantPanel: {
    description: 'The assistant panel',
  },
})
