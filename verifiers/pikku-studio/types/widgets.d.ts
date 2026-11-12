import type { StudioVariantData } from '@pikku/core/addon'

// The host's core widgets. Studio's widget package fills this registry the
// same way; this verifier names the one its arranged screen places.
declare module '@pikku/core/addon' {
  interface WidgetRegistry {
    verdict: StudioVariantData<'wrong' | 'fine'>
  }
}
