import { pikkuMiddleware } from '#pikku'

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
  async ({ logger }, { http, channel, mcp, rpc, cli }, next) => {
    const start = Date.now()

    // Determine the wire type for better logging
    let wireType = 'unknown'
    if (http) {
      wireType = `HTTP ${http.request?.method()?.toUpperCase()} ${http.request?.path()}`
    } else if (channel) {
      wireType = `Channel ${channel.channelId}`
    } else if (mcp) {
      wireType = 'MCP'
    } else if (rpc) {
      wireType = 'RPC'
    } else if (cli) {
      wireType = `CLI ${cli.command.join(' ')}`
    } else {
      wireType = 'Queue/Scheduler'
    }

    logger.info(`[${wireType}] Function execution started`)

    try {
      await next()
      const duration = Date.now() - start
      logger.info(
        `[${wireType}] Function execution completed successfully in ${duration}ms`
      )
    } catch (error) {
      const duration = Date.now() - start
      logger.error(
        `[${wireType}] Function execution failed after ${duration}ms:`,
        error
      )
      throw error
    }
  }
)
