import { CoreSingletonServices, CreateSessionServices } from '@pikku/core'
import { compileAllSchemas } from '@pikku/core/schema'
import { runHTTPRoute, RunRouteOptions } from '@pikku/core/http'
import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { PikkuFastifyRequest } from './pikku-fastify-request.js'
import { PikkuFastifyResponse } from './pikku-fastify-response.js'
import { logRoutes } from '@pikku/core/http'

/**
 * The `PikkuFastifyPlugin` is a Fastify plugin that integrates the Pikku framework with Fastify,
 * providing an easy way to set up and handle requests using Pikku's routing system.
 *
 * @typedef {Object} PikkuFastifyPluginOptions - Options for configuring the plugin.
 * @property {Object} pikku - Pikku-related configuration options.
 * @property {CoreSingletonServices} pikku.singletonServices - The singleton services used by the handler.
 * @property {CreateSessionServices<any, any, any>} pikku.createSessionServices - A function to create session services for each request.
 * @property {boolean} [pikku.logRoutes] - Whether to log the routes.
 * @property {boolean} [pikku.loadSchemas] - Whether to load all schemas.
 * @property {boolean} [pikku.skipUserSession] - Whether to skip user session creation for this route.
 * @property {boolean} [pikku.respondWith404] - Whether to respond with a 404 status if the route is not found.
 */
export type PikkuFastifyPluginOptions = {
  pikku: {
    singletonServices: CoreSingletonServices
    createSessionServices: CreateSessionServices<any, any, any>
    logRoutes?: boolean
    loadSchemas?: boolean
  } & RunRouteOptions
}

/**
 * The `pikkuPlugin` integrates the Pikku routing and service creation capabilities with Fastify,
 * enabling developers to easily manage route handling using Pikku's core features.
 *
 * @param {FastifyPluginAsync<PikkuFastifyPluginOptions>} fastify - The Fastify instance.
 * @param {PikkuFastifyPluginOptions} options - The configuration options for the plugin.
 */
const pikkuPlugin: FastifyPluginAsync<
  PikkuFastifyPluginOptions
> = async (fastify, { pikku }) => {
  if (pikku.logRoutes) {
    logRoutes(pikku.singletonServices.logger)
  }
  if (pikku.loadSchemas) {
    if (!pikku.singletonServices.schemaService) {
      throw new Error('SchemaService needs to be defined to load schemas')
    }
    compileAllSchemas(pikku.singletonServices.logger, pikku.singletonServices.schemaService)
  }
  fastify.all('/*', async (req, res) => {
    await runHTTPRoute({
      request: new PikkuFastifyRequest(req),
      response: new PikkuFastifyResponse(res),
      singletonServices: pikku.singletonServices,
      createSessionServices: pikku.createSessionServices,
      method: req.method as any,
      route: req.url as string,
      respondWith404: pikku.respondWith404,
    })
  })
}

export default fp(pikkuPlugin, '5.x')
