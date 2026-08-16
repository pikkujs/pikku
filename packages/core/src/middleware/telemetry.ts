import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from './middleware-factories.js'
/** Outermost telemetry: total duration, including every middleware. */
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

/** Innermost telemetry: function-only duration, excluding outer middleware. */
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
