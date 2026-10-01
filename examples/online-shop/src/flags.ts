import { defineFeatureFlags } from '#pikku/scopes'

// @snippet start defineFeatureFlags
defineFeatureFlags({
  orderExport: {
    description: 'Bulk export of orders to CSV',
    anyOf: ['reports:read'],
  },
})
// @snippet end defineFeatureFlags
