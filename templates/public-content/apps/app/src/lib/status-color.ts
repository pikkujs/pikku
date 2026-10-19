/**
 * Text colour for a `variant="light"` badge or status label.
 *
 * The pill's fill carries the meaning; the text only has to be legible on it.
 * Mantine's light variant tints the text to match the fill, which reads well and
 * measures badly — teal came out at 4.33:1 and orange at 3.62:1 against a 4.5:1
 * requirement. Shade 9 is already the darkest shade in the ramp, so there is no
 * darker tint to reach for: the tinting itself is the ceiling.
 *
 * The evidence for the fix was on the same page. The one badge that passed was
 * the grey `queued` pill at 13.87:1, and it passed because its text is the
 * theme's ordinary text colour rather than a tint of its fill. Doing the same
 * for the coloured pills keeps every fill — and so all of the colour coding a
 * reader scans by — and only gives up tinted lettering, which was never the
 * thing carrying the meaning.
 *
 * `--mantine-color-text` also removes the need to know the colour scheme: it is
 * near-black on light and near-white on dark, resolved by the theme.
 */
export const STATUS_TEXT_COLOR = 'var(--mantine-color-text)'
