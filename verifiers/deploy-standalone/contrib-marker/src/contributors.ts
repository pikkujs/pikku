import { defineContributors } from '@pikku/core/contributors'
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
  'not-opted-in': { deploy: notOptedInDeploy },
})
