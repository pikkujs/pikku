import { defineFeatureFlags } from '#pikku/scopes'

defineFeatureFlags({
  sandboxes: { description: 'The sandbox workspace' },
  nightlyReindex: { description: 'The nightly reindex job' },
})
