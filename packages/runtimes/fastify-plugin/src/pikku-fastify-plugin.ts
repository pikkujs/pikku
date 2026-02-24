import type { Logger } from '@pikku/core/services'
import { compileAllSchemas } from '@pikku/core/schema'
import { fetch, RunHTTPWiringOptions } from '@pikku/core/http'
import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { logRoutes } from '@pikku/core/http'
import { fastifyToRequest } from './fastify-request-convertor.js'
import { sendResponseToFastify } from './fastify-response-convertor.js'

/**
 * The `PikkuFastifyPlugin` is a Fastify plugin that integrates the Pikku framework with Fastify,
 * providing an easy way to set up and handle requests using Pikku's routing system.
 */
export type PikkuFastifyPluginOptions = {
  pikku: {
    logger?: Logger
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
  if (pikku.logRoutes && pikku.logger) {
    logRoutes(pikku.logger)
  }
  if (pikku.loadSchemas && pikku.logger) {
    compileAllSchemas(pikku.logger)
  }
  fastify.all('/*', async (req, res) => {
    const response = await fetch(fastifyToRequest(req), {
      respondWith404: pikku.respondWith404,
    })
    await sendResponseToFastify(res, response)
  })
}

export default fp(pikkuPlugin, '5.x')
