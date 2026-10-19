import { defineContributors } from '@pikku/core/contributors'
import { hookA } from './hook-a.js'
import { hookB } from './hook-b.js'
import { markerDeploy } from './marker.js'
import { markerReaderDeploy } from './marker-reader.js'
import { notOptedInDeploy } from './not-opted-in.js'

// `marker-reader` is registered first on purpose: it needs what `marker`
// provides, and `marker` needs the entry's own logger, so run order has to come
// from needs/provides and not from the order here. Each variant lives in its
// own module, which is what lets an unselected one stay out of a bundle.
export const contributors = defineContributors({
  'marker-reader': { deploy: markerReaderDeploy },
  marker: { deploy: markerDeploy },
  // Registered out of order again: hook-b needs hook-a, which decides the hook order.
  'hook-b': { deploy: hookB },
  'hook-a': { deploy: hookA },
  'not-opted-in': { deploy: notOptedInDeploy },
})
