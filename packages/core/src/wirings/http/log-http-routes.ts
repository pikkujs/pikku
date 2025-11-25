import { pikkuState } from '../../pikku-state.js'
import { Logger } from '../../services/index.js'

/**
 * Logs all the loaded routes.
 * @param logger - A logger for logging information.
 */
export const logRoutes = (logger: Logger) => {
  const routesByType = pikkuState(null, 'http', 'routes')
  if (routesByType.size === 0) {
    logger.info('No routes added')
    return
  }

  let routesMessage = 'Routes loaded:'
  routesByType.forEach((routes) => {
    routes.forEach((route) => {
      routesMessage += `\n\t- ${route.method.toUpperCase()} -> ${route.route}`
    })
  })
  logger.info(routesMessage)
}
