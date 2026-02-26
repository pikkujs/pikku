/**
 * This module provides a Fastify plugin for integrating the Pikku framework with Fastify,
 * allowing developers to use Pikku's routing and service creation features seamlessly within a Fastify application.
 *
 * @module @pikku/fastify-plugin
 */

import pikkuFastifyPlugin from './pikku-fastify-plugin.js'
export default pikkuFastifyPlugin
export { FastifyPikkuHTTPRequest } from './fastify-pikku-http-request.js'
export { FastifyPikkuHTTPResponse } from './fastify-pikku-http-response.js'
