import { isProduction } from './env.js'
import { getErrorResponse } from './errors/error-handler.js'
import { NotFoundError } from './errors/errors.js'
import type { Logger } from './services/logger.js'
import type { PikkuHTTP } from './wirings/http/http.types.js'

export const handleHTTPError = (
  e: any,
  http: PikkuHTTP | undefined,
  traceId: string | undefined,
  logger: Logger,
  logWarningsForStatusCodes: number[],
  respondWith404: boolean,
  bubbleError: boolean,
  exposeErrors: boolean = false
) => {
  if (e instanceof NotFoundError && !respondWith404) {
    return
  }

  const errorResponse = getErrorResponse(e)
  if (errorResponse != null) {
    const clientFacing =
      errorResponse.status < 500 || (exposeErrors && !isProduction())

    http?.response?.status(errorResponse.status)
    http?.response?.json({
      name: e instanceof Error ? e.name : undefined,
      message:
        clientFacing &&
        e instanceof Error &&
        e.message &&
        e.message !== 'An error occurred'
          ? e.message
          : errorResponse.message,
      payload: clientFacing ? (e as any).payload : undefined,
      errorId: traceId,
    })

    if (logWarningsForStatusCodes.includes(errorResponse.status)) {
      if (traceId) {
        logger.warn(`Warning id: ${traceId}`)
      }
      logger.warn(e instanceof Error ? e.message : e)
    }
  } else {
    logger.error(e instanceof Error ? e.message : e)
    http?.response?.status(500)

    if (traceId) {
      logger.warn(`Error id: ${traceId}`)
      const errorBody: Record<string, unknown> = { errorId: traceId }
      if (exposeErrors && !isProduction() && e instanceof Error) {
        errorBody.message = e.message
        errorBody.stack = e.stack
      }
      http?.response?.json(errorBody)
    }
  }

  if (bubbleError) {
    throw e
  }
}
