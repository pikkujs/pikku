/**
 * A fully-specified ISO-8601 instant: date, time, and an explicit zone.
 *
 * Anchored at both ends, because the previous pattern was open-ended and so
 * matched anything that merely *began* with a date — an id like
 * `2026-03-14-invoice-7`, a log line, a version string — and replaced it with a
 * `Date`. The generated SDK still typed those fields as `string`, so the
 * transport quietly contradicted the types TypeScript was checking against.
 *
 * The zone is required for the same reason. `2026-03-14` and
 * `2026-03-14T08:12:00` name a reading on a calendar or a clock, not a moment:
 * the sender never said which instant it meant, and `new Date` guesses
 * differently for each (UTC midnight for the first, the *client's* local zone
 * for the second), so one payload decodes to different times on different
 * machines. Left as strings, they stay exactly what the server sent.
 *
 * Fractional seconds are optional so that `2026-03-14T08:12:00Z` — whole
 * seconds, which many servers emit — is revived like its millisecond form.
 */
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

/**
 * The `transformDates` function recursively traverses an object or array and converts unambiguous
 * ISO-8601 instants into JavaScript `Date` objects. This helps in ensuring that date fields are
 * properly handled as `Date` instances rather than strings.
 *
 * Only a string carrying a date, a time *and* an explicit zone is revived; a bare `YYYY-MM-DD`, a
 * zoneless date-time, and any other string are returned untouched.
 *
 * @private
 * @param {any} data - The input data that may contain date strings. It can be an object, array, or primitive value.
 * @returns {any} - The transformed data with ISO-8601 instants converted to `Date` objects.
 */
export const transformDates = (data: any) => {
  if (data === null) return null
  if (Array.isArray(data)) return data.map(transformDates.bind(this))
  if (typeof data === 'object') {
    return Object.entries(data).reduce((result, [key, value]) => {
      result[key] = transformDates(value)
      return result
    }, {} as any)
  }
  if (typeof data === 'string' && ISO_INSTANT.test(data)) {
    const date = new Date(data)
    // The shape can be right while the value is not a real point in time
    // (`2026-02-31T00:00:00Z`). Returning an Invalid Date would push the
    // failure into whatever formats it later; the raw string is at least
    // inspectable.
    return Number.isNaN(date.getTime()) ? data : date
  }
  return data
}
