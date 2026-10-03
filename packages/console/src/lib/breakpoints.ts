import { useMediaQuery } from '@mantine/hooks'

/**
 * The phone breakpoint, defined once.
 *
 * It matches Mantine's `md`: below it a split view collapses to a single column
 * and its panel moves into the bottom sheet. Kept in one place because the one
 * number deciding whether a second column can exist at all was previously the
 * bare string `'(max-width: 48em)'` in a dozen files.
 *
 * It covers tablets and landscape phones, not just portrait phones. At `sm` a
 * 900px viewport still ran the pointer layout — the nav dock rather than the tab
 * bar, and a panel docked beside the page rather than a sheet raised from the
 * foot — on a screen with no room for a second column. A host app that embeds
 * these screens inside its own shell saw the halves disagree: the shell in its
 * mobile layout, every page inside it still on the desktop path.
 */
export const MOBILE_QUERY = '(max-width: 62em)'

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
 * The tablet-and-below breakpoint — Mantine's `md`, where a wide one-line row
 * (label, metadata and a trailing action all on one baseline) stops fitting and
 * stacks instead. It is now the same number as {@link MOBILE_QUERY}, which moved
 * up to meet it; the two are kept apart because they answer different questions
 * — "can a second column exist" and "does a row still fit on one line" — and the
 * first is the one a phone-shaped layout hangs off.
 */
export const COMPACT_QUERY = '(max-width: 62em)'

/** True on tablet-or-narrower viewports. See {@link COMPACT_QUERY}. */
export function useCompact(): boolean {
  return useMediaQuery(COMPACT_QUERY) ?? false
}
