import type { DataLockStatus } from '@pikku/core/data-lock'

export type { DataLockStatus }

/**
 * The passphrase gate's four routes, typed by hand.
 *
 * `wireDataLock` registers them at runtime from core, so nothing in the app's
 * source declares them and the generated fetch client — which is built from
 * what codegen can see — has no entry for them. They are framework routes
 * rather than this app's, so they are typed here instead of being pushed into
 * the generated client: the response shape is imported from core, which keeps
 * the one contract that matters in a single place.
 */
const PREFIX = '/_pikku/data'

/** A non-2xx answer from a lock route, carrying the status the UI branches on. */
export class DataLockRequestError extends Error {
  constructor(readonly status: number) {
    super(`The lock endpoint answered ${status}`)
    this.name = 'DataLockRequestError'
  }
}

const call = async (
  path: string,
  passphrase?: string
): Promise<DataLockStatus> => {
  const response = await fetch(`${PREFIX}${path}`, {
    method: passphrase === undefined ? 'GET' : 'POST',
    headers:
      passphrase === undefined
        ? undefined
        : { 'content-type': 'application/json' },
    body: passphrase === undefined ? undefined : JSON.stringify({ passphrase }),
  })

  if (!response.ok) {
    throw new DataLockRequestError(response.status)
  }

  return (await response.json()) as DataLockStatus
}

export const dataLock = {
  status: () => call('/status'),
  initialize: (passphrase: string) => call('/initialize', passphrase),
  unlock: (passphrase: string) => call('/unlock', passphrase),
  lock: (passphrase: string) => call('/lock', passphrase),
}
