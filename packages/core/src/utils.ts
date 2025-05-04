import { Logger } from './services/logger.js'

// TODO: SessionServices probably needs it's own type
// but is an issue for the future and will be tackled
// with dependency injection
export const closeSessionServices = async (
  logger: Logger,
  sessionServices: Record<string, any>
) => {
  await Promise.all(
    Object.values(sessionServices).map(async (service) => {
      if (service?.close) {
        try {
          await service.close()
        } catch (e: any) {
          logger.error(e)
        }
      }
    })
  )
}

export const createWeakUID = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
}
