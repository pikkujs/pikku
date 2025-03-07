import { Logger } from '../services/index.js'
import { getRoutes } from './http-route-runner.js'

/**
 * Logs all the loaded routes.
 * @param logger - A logger for logging information.
 */
export const logRoutes = (logger: Logger) => {
  const { routes } = getRoutes()
  if (routes.length === 0) {
    logger.info('No routes added')
    return
  }

  let routesMessage = 'Routes loaded:'
  for (const { method, route } of routes) {
    routesMessage += `\n\t- ${method.toUpperCase()} -> ${route}`
  }
  logger.info(routesMessage)
}
