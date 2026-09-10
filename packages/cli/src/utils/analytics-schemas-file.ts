import { dirname, join } from 'node:path'

/**
 * The schemas module always sits beside the ingest that imports it, so there is
 * nothing to configure: a settable path could be moved out from under the
 * generated `./analytics.schemas.gen.js` import and nothing would write it.
 */
export const analyticsSchemasFile = (
  analyticsFile: string | undefined
): string | undefined =>
  analyticsFile
    ? join(dirname(analyticsFile), 'analytics.schemas.gen.ts')
    : undefined
