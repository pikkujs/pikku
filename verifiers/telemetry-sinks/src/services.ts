import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import type { OpenSpan, OtlpSinkBase } from '@pikku/core/otlp'
import type { AnalyticsEventSink, AnalyticsRecord } from '@pikku/core/analytics'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const started: OpenSpan[] = []
export const ended: Parameters<OtlpSinkBase['exportSpans']>[0] = []
export const resources: string[] = []
export const conversions: AnalyticsRecord[] = []

/** An in-process OTLP sink: the app's own code, registered in plain code. */
const recordingSink: OtlpSinkBase = {
  setResource: (resource) => void resources.push(resource.serviceName),
  onSpanStart: (span) => void started.push(span),
  exportSpans: (spans) => void ended.push(...spans),
  exportLogs() {},
  exportMetrics() {},
  flush: async () => {},
  close: async () => {},
}

const conversionSink: AnalyticsEventSink = {
  write: async (batch) => void conversions.push(...batch),
}

export const createConfig = pikkuConfig(async () => ({}))

export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const secrets =
      existingServices?.secrets || new LocalSecretService(variables)
    const logger = existingServices?.logger || new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)

    existingServices!.otlpSinks!.add(recordingSink)
    existingServices!.analyticsSinks!.add(conversionSink, {
      checkout_completed: true,
    })

    return {
      ...existingServices,
      config,
      secrets,
      logger,
      variables,
      schema,
    } as RequiredSingletonServices
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
