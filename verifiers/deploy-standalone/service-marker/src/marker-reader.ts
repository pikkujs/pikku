import { pikkuService } from '@pikku/core/pikku-service'

/** Needs what `marker` provides, so it runs after it. */
export const markerReader = pikkuService({
  common: ({ platformMarker }) => ({
    platformMarkerSeen: platformMarker.from === 'wireAddon.services',
  }),
})
