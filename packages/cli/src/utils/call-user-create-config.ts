import type { VariablesService } from '@pikku/core/services'

/**
 * Runs the project's `createConfig` the way every host does: with the
 * `variables` service as its first argument. Cloudflare, Lambda, Azure and the
 * CLI runner all pass one, and a config that reads its values through it (not
 * `process.env`, which a Worker does not have) must see the same thing under
 * `pikku serve`, `pikku dev` and the db commands.
 */
export const callUserCreateConfig = async <T = any>(
  createConfig: (variables: VariablesService) => Promise<T> | T,
  variables: VariablesService
): Promise<T> => createConfig(variables)
