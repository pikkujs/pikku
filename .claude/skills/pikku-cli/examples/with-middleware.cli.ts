import { wireCLI, pikkuCLICommand } from './pikku-types.gen.js'
import { pikkuMiddleware } from '#pikku/pikku-types.gen.js'
import { InvalidMiddlewareInteractionError } from '@pikku/core/errors'
import { deployApp } from './functions/deploy.function.js'
import { requireAdmin } from './permissions.js'

/**
 * Middleware and permissions for CLI
 * Demonstrates CLI-specific middleware with interaction guards
 */

// CLI-specific middleware
const cliAudit = pikkuMiddleware(async ({ logger }, interaction, next) => {
  // ✅ CRITICAL: Verify this is a CLI interaction
  if (!interaction.cli) {
    throw new InvalidMiddlewareInteractionError(
      'cliAudit middleware can only be used with CLI interactions'
    )
  }

  const t0 = Date.now()

  logger.info('cli.command.start', {
    program: interaction.cli.program,
    command: interaction.cli.command.join(' '),
  })

  try {
    await next()
    logger.info('cli.command.success', {
      program: interaction.cli.program,
      command: interaction.cli.command.join(' '),
      ms: Date.now() - t0,
    })
  } catch (error) {
    logger.warn('cli.command.error', {
      program: interaction.cli.program,
      command: interaction.cli.command.join(' '),
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - t0,
    })
    throw error
  }
})

wireCLI({
  program: 'deploy-tool',

  // Global middleware (applies to all commands)
  middleware: [cliAudit],

  commands: {
    deploy: pikkuCLICommand({
      parameters: '<env>',
      func: deployApp,
      description: 'Deploy application to environment',
      auth: true, // Requires authentication
      permissions: {
        admin: requireAdmin, // Requires admin permission
      },
      options: {
        force: {
          description: 'Force deployment',
          short: 'f',
          default: false,
        },
      },
    }),
  },
})

// Usage:
// deploy-tool deploy production
// deploy-tool deploy staging --force
