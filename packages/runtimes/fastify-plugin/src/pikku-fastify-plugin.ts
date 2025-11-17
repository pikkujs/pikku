import { CoreSingletonServices, CreateWireServices } from '@pikku/core'
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
 *
 * @typedef {Object} PikkuFastifyPluginOptions - Options for configuring the plugin.
 * @property {Object} pikku - Pikku-related configuration options.
 * @property {CoreSingletonServices} pikku.singletonServices - The singleton services used by the handler.
 * @property {CreateWireServices<any, any, any>} pikku.createWireServices - A function to create wire services for each request.
 * @property {boolean} [pikku.logRoutes] - Whether to log the routes.
 * @property {boolean} [pikku.loadSchemas] - Whether to load all schemas.
 * @property {boolean} [pikku.skipUserSession] - Whether to skip user session creation for this route.
 * @property {boolean} [pikku.respondWith404] - Whether to respond with a 404 status if the route is not found.
 */
export type PikkuFastifyPluginOptions = {
  pikku: {
    singletonServices: CoreSingletonServices
    createWireServices: CreateWireServices<any, any, any>
    logRoutes?: boolean
    loadSchemas?: boolean
  } & RunHTTPWiringOptions
}

/**
 * The `pikkuPlugin` integrates the Pikku routing and service creation capabilities with Fastify,
 * enabling developers to easily manage route handling using Pikku's core features.
 *
 * @param {FastifyPluginAsync<PikkuFastifyPluginOptions>} fastify - The Fastify instance.
 * @param {PikkuFastifyPluginOptions} options - The configuration options for the plugin.
 */
const pikkuPlugin: FastifyPluginAsync<PikkuFastifyPluginOptions> = async (
  fastify,
  { pikku }
) => {
  if (pikku.logRoutes) {
    logRoutes(pikku.singletonServices.logger)
  }
  if (pikku.loadSchemas) {
    if (!pikku.singletonServices.schema) {
      throw new Error('SchemaService needs to be defined to load schemas')
    }
    compileAllSchemas(
      pikku.singletonServices.logger,
      pikku.singletonServices.schema
    )
  }
  fastify.all('/*', async (req, res) => {
    const response = await fetch(fastifyToRequest(req), {
      singletonServices: pikku.singletonServices,
      createWireServices: pikku.createWireServices,
      respondWith404: pikku.respondWith404,
    })
    await sendResponseToFastify(res, response)
  })
}

export default fp(pikkuPlugin, '5.x')
