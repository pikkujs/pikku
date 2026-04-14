import { pikkuMiddleware, pikkuMiddlewareFactory } from '../types/core.types.js'

/**
 * Outer telemetry middleware that captures total request duration and outcome.
 * Runs at `highest` priority (outermost in the middleware chain).
 *
 * Emits a structured JSON log entry with `__pikku_telemetry: 'end'` containing:
 * - Total duration (including all middleware)
 * - Outcome (ok/error)
 * - Wire metadata (wireType, wireId, traceId)
 * - HTTP details (method, path, status) if applicable
 *
 * @example
 * ```typescript
 * import { telemetryOuter } from '@pikku/core/middleware'
 * addMiddleware('myTag', [telemetryOuter()])
 * ```
 */
export const telemetryOuter = pikkuMiddlewareFactory<{
  environmentId?: string
  orgId?: string
} | void>(({ environmentId, orgId } = {}) => {
  return pikkuMiddleware({
    name: 'telemetry-outer',
    priority: 'highest',
    func: async (services, wire, next) => {
      const start = performance.now()
      let outcome = 'ok'
      let errorMessage: string | undefined
      try {
        await next()
      } catch (e) {
        outcome = 'error'
        errorMessage = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        services.logger.info({
          __pikku_telemetry: 'end',
          __pikku_layer: 'outer',
          traceId: wire.traceId,
          wireType: wire.wireType,
          wireId: wire.wireId,
          totalDuration: Math.round(performance.now() - start),
          outcome,
          ...(errorMessage ? { errorMessage } : {}),
          ...(wire.http
            ? {
                httpStatus: wire.http.response?.statusCode,
                httpMethod: wire.http.request?.method(),
                httpPath: wire.http.request?.path(),
              }
            : {}),
          ...(environmentId ? { environmentId } : {}),
          ...(orgId ? { orgId } : {}),
        })
      }
    },
  })
})

/**
 * Inner telemetry middleware that captures function execution duration and user context.
 * Runs at `lowest` priority (innermost, closest to the function).
 *
 * Emits a structured JSON log entry with `__pikku_telemetry: 'end'` containing:
 * - Function-only duration (excluding outer middleware like auth)
 * - User identity (pikkuUserId) if authenticated
 * - Wire metadata (wireType, wireId, traceId)
 *
 * @example
 * ```typescript
 * import { telemetryInner } from '@pikku/core/middleware'
 * addMiddleware('myTag', [telemetryInner()])
 * ```
 */
export const telemetryInner = pikkuMiddlewareFactory<{
  environmentId?: string
  orgId?: string
} | void>(({ environmentId, orgId } = {}) => {
  return pikkuMiddleware({
    name: 'telemetry-inner',
    priority: 'lowest',
    func: async (services, wire, next) => {
      const start = performance.now()
      let outcome = 'ok'
      let errorMessage: string | undefined
      try {
        await next()
      } catch (e) {
        outcome = 'error'
        errorMessage = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        services.logger.info({
          __pikku_telemetry: 'end',
          __pikku_layer: 'inner',
          traceId: wire.traceId,
          wireType: wire.wireType,
          wireId: wire.wireId,
          functionDuration: Math.round(performance.now() - start),
          outcome,
          pikkuUserId: wire.pikkuUserId,
          ...(errorMessage ? { errorMessage } : {}),
          ...(environmentId ? { environmentId } : {}),
          ...(orgId ? { orgId } : {}),
        })
      }
    },
  })
})
