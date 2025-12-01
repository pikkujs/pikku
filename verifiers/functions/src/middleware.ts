import { pikkuMiddleware } from '../.pikku/pikku-types.gen.js'

/**
 * Logging middleware that works across all wiring types
 * (HTTP, Queue, Channel, MCP, RPC, Scheduler)
 *
 * The wire parameter contains different objects based on the wiring type:
 * - HTTP: { http: PikkuHTTP }
 * - Channel: { channel: PikkuChannel }
 * - MCP: { mcp: PikkuMCP }
 * - RPC: { rpc: PikkuRPC }
 * - CLI: { cli: PikkuCLI }
 * - Queue: {} (empty object)
 * - Scheduler: {} (empty object)
 */
export const loggingMiddleware = pikkuMiddleware(
  async (services, wire, next) => {
    const start = Date.now()

    // Determine the wire type for better logging
    let wireType = 'unknown'
    if (wire.http) {
      wireType = `HTTP ${wire.http.request?.method()?.toUpperCase()} ${wire.http.request?.path()}`
    } else if (wire.channel) {
      wireType = `Channel ${wire.channel.channelId}`
    } else if (wire.mcp) {
      wireType = 'MCP'
    } else if (wire.rpc) {
      wireType = 'RPC'
    } else if (wire.cli) {
      wireType = `CLI ${wire.cli.command.join(' ')}`
    } else {
      wireType = 'Queue/Scheduler'
    }

    services.logger.info(`[${wireType}] Function execution started`)

    try {
      await next()
      const duration = Date.now() - start
      services.logger.info(
        `[${wireType}] Function execution completed successfully in ${duration}ms`
      )
    } catch (error) {
      const duration = Date.now() - start
      services.logger.error(
        `[${wireType}] Function execution failed after ${duration}ms:`,
        error
      )
      throw error
    }
  }
)
