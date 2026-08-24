/**
 * Marks an input whose value no longer matches the one it came from.
 *
 * Deliberately says nothing about where the other value came from, because the
 * comparison is the same one either way. A row edited at runtime against what
 * the repository declares; a form field against what it held when it loaded; a
 * setting against the default it was seeded with. In every case there are two
 * values, the second is the one being rendered, and without a mark nobody can
 * tell by looking which fields were touched.
 *
 * That makes it worth wiring `original` through even where a form is not being
 * edited yet: pass what the value started as and every subsequent keystroke
 * marks itself, with no dirty-tracking state and nothing asked of the server.
 *
 * `undefined` means no comparison was asked for, so a field whose original
 * value is genuinely absent cannot be marked — pass `null` for that.
 *
 * Deliberately a plain function rather than a hook: there is no state and
 * nothing to subscribe to, so a hook would only add a rule about where it may
 * be called. Components that take an `original` run it themselves; anything
 * else can call it and spread the result.
 *
 * Orange rather than red. A value that differs from the one it came from is not
 * an error — someone probably meant it — it is a thing to notice before
 * assuming what is on screen is what was there.
 */
export const modifiedStyles = (
  value: unknown,
  original: unknown,
  /**
   * Which part Mantine actually draws the border on. `input` for anything that
   * holds text; a toggle hides its input and paints elsewhere.
   */
  key: string = 'input'
): { styles?: Record<string, { borderColor: string }> } => {
  if (original === undefined) return {}
  // Structural rather than referential: the values being compared are small —
  // a string, a number, a list of goals — and a caller holding an equal array
  // from a different render is the normal case, not the exception.
  const same =
    Object.is(value, original) ||
    JSON.stringify(value ?? null) === JSON.stringify(original ?? null)
  if (same) return {}
  return {
    styles: { [key]: { borderColor: 'var(--mantine-color-orange-filled)' } },
  }
}
