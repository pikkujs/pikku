import { defineProvider } from '@pikku/core/provider'

/** Needs what `marker` provides, so it runs after it. */
export const markerReader = defineProvider({
  common: ({ platformMarker }) => ({
    platformMarkerSeen: platformMarker.from === 'wireAddon.providers',
  }),
})
