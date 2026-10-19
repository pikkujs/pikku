import { rem } from '@pikku/mantine/core'
import { useMediaQuery } from '@mantine/hooks'

/** Mantine's `sm`. Agrees with every `hiddenFrom="sm"` in the shell. */
export const PHONE_QUERY = '(max-width: 48em)'

export const TAB_BAR_HEIGHT = 56

/** Height of the phone-only header a shell adds when it uses `MobileNavDrawer`. */
export const MOBILE_HEADER_HEIGHT = 56

/** The bar's full foot, home-indicator inset included. Sheets stop here. */
export const TAB_BAR_FOOT = `calc(${rem(TAB_BAR_HEIGHT)} + env(safe-area-inset-bottom, 0px))`

/**
 * For behaviour CSS cannot express — closing an open surface when the viewport
 * grows past the breakpoint. NOT for deciding what to render: `useMediaQuery`
 * returns `undefined` during SSR, so gate rendering with `hiddenFrom="sm"` instead.
 */
export function usePhone(): boolean {
  return useMediaQuery(PHONE_QUERY) ?? false
}
