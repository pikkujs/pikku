import { pikkuState } from '../pikku-state.js'
import { Logger } from '../services/index.js'

/**
 * Logs all the loaded routes.
 * @param logger - A logger for logging information.
 */
export const logRoutes = (logger: Logger) => {
  const routes = pikkuState('http', 'routes')
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
