import type { Logger } from '@pikku/core/services'
import { compileAllSchemas } from '@pikku/core/schema'
import type { RunHTTPWiringOptions } from '@pikku/core/http'
import { fetchData } from '@pikku/core/http'
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { logRoutes } from '@pikku/core/http'
import { FastifyPikkuHTTPRequest } from './fastify-pikku-http-request.js'
import { FastifyPikkuHTTPResponse } from './fastify-pikku-http-response.js'

/**
 * The `PikkuFastifyPlugin` is a Fastify plugin that integrates the Pikku framework with Fastify,
 * providing an easy way to set up and handle requests using Pikku's routing system.
 */
export type PikkuFastifyPluginOptions = {
  pikku: {
    logger: Logger
    logRoutes?: boolean
    loadSchemas?: boolean
  } & RunHTTPWiringOptions
}

/**
 * The `pikkuPlugin` integrates the Pikku routing and service creation capabilities with Fastify,
 * enabling developers to easily manage route handling using Pikku's core features.
 *
 * @param fastify - The Fastify instance.
 * @param options - The configuration options for the plugin.
 */
const pikkuPlugin: FastifyPluginAsync<PikkuFastifyPluginOptions> = async (
  fastify,
  { pikku }
) => {
  if (pikku.logRoutes) {
    logRoutes(pikku.logger)
  }
  if (pikku.loadSchemas) {
    compileAllSchemas(pikku.logger)
  }
  const {
    logger,
    logRoutes: _logRoutes,
    loadSchemas: _loadSchemas,
    ...runOptions
  } = pikku
  fastify.all('/*', async (req, res) => {
    const request = new FastifyPikkuHTTPRequest(req)
    const response = new FastifyPikkuHTTPResponse(res)
    await fetchData(request, response, runOptions)
    response.flush()
  })
}

export default fp(pikkuPlugin, '5.x')
