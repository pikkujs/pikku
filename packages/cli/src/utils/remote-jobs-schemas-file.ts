import { dirname, join } from 'node:path'

/**
 * The schemas module always sits beside the routes that import it, so there is
 * nothing to configure: a settable path could be moved out from under the
 * generated `./remote-jobs.schemas.gen.js` import and nothing would write it.
 */
export const remoteJobsSchemasFile = (
  remoteJobsFile: string | undefined
): string | undefined =>
  remoteJobsFile
    ? join(dirname(remoteJobsFile), 'remote-jobs.schemas.gen.ts')
    : undefined
