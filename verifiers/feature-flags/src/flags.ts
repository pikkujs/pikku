import { defineFeatureFlags } from '#pikku/scopes'

defineFeatureFlags({
  sandboxes: {
    description: 'The sandbox workspace',
    anyOf: ['sandboxes:read', 'sandboxes:admin'],
  },
  nightlyReindex: {
    description: 'The nightly reindex job — a kill switch with no audience',
  },
})
