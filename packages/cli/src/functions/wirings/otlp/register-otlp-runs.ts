import type { Logger } from '@pikku/core/services'
import type { OtlpSinkRegistry } from '@pikku/core/otlp'
import { registerOtlpLive, type OtlpLive } from '@pikku/core/otlp/runs'

let current: OtlpLive | undefined

/**
 * The live feed of this process, set by `registerOtlpRuns`; undefined where the
 * feed is off. The routes the `scaffold.otlpRuns` scaffold generates read it
 * through `@pikku/cli/otlp-runs`.
 */
export const getOtlpRuns = (): OtlpLive | undefined => current

/**
 * Starts the live runs feed of this process and makes it the one the generated
 * routes serve. Those routes answer 404 until this has run, so the commands
 * decide whether a process has a feed at all: only a project that turns
 * `scaffold.otlpRuns` on gets one.
 *
 * It is called from the commands rather than generated into the project: an app
 * bootstrap is what a deployed bundle imports, and a data surface over a
 * process's own traces has no business in one. The listener is made once per
 * sink registry.
 */
export const registerOtlpRuns = (options: {
  otlpSinks: OtlpSinkRegistry
  eventHub: { publish(topic: string, data: unknown): Promise<void> }
  serviceName: string
  logger?: Pick<Logger, 'warn'>
}): OtlpLive => {
  const live = registerOtlpLive({
    otlpSinks: options.otlpSinks,
    serviceName: options.serviceName,
    logger: options.logger,
    publish: (topic, batch) => options.eventHub.publish(topic, batch),
  })

  const served: OtlpLive = {
    ...live,
    close: () => {
      if (current === served) current = undefined
      live.close()
    },
  }
  current = served
  return served
}
