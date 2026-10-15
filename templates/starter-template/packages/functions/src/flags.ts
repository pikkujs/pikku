/**
 * The switches this app ships behind.
 *
 * `assistantPanel` is a PLACEHOLDER so the Flags screen has something to show
 * on a fresh project. REPLACE it with this app's real flags.
 *
 * Flags fail closed, so codegen builds a `FeatureFlagName` union from these
 * declarations: a typo'd flag reads `false`, hides its feature permanently, and
 * leaves every test and screenshot green.
 */
import { defineFeatureFlags } from '@pikku/core/flag'

defineFeatureFlags({
  assistantPanel: {
    description: 'The assistant panel',
  },
})
