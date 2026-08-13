import { useMediaQuery } from '@mantine/hooks'

/**
 * The phone breakpoint, defined once.
 *
 * It matches Mantine's `sm`: below it a split view collapses to a single column
 * and its panel moves into the bottom sheet. Kept in one place because the one
 * number deciding whether a second column can exist at all was previously the
 * bare string `'(max-width: 48em)'` in a dozen files.
 */
export const MOBILE_QUERY = '(max-width: 48em)'

/**
 * True on phone-width viewports.
 *
 * `useMediaQuery` returns `undefined` on the first render (and during SSR), which
 * every call site would otherwise flatten with its own `?? false`. Doing it here
 * means a missing `??` can't quietly put a screen on the desktop path for one
 * frame.
 */
export function usePhone(): boolean {
  return useMediaQuery(MOBILE_QUERY) ?? false
}

/**
 * The tablet-and-below breakpoint — Mantine's `md`. Wider than {@link MOBILE_QUERY}:
 * a second column still fits here, but a wide one-line row (label, metadata and a
 * trailing action all on one baseline) does not, so those rows stack instead.
 */
export const COMPACT_QUERY = '(max-width: 62em)'

/** True on tablet-or-narrower viewports. See {@link COMPACT_QUERY}. */
export function useCompact(): boolean {
  return useMediaQuery(COMPACT_QUERY) ?? false
}
