import { readFileSync } from 'node:fs'
import { pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
  type ScopeService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'

/** Test only: each user's grants, read from a file the test rewrites. */
const grantsOf = async (userId: string): Promise<string[]> => {
  const grants = JSON.parse(readFileSync('grants.json', 'utf8'))
  return grants[userId] ?? []
}

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const logger = existingServices?.logger ?? new ConsoleLogger()
    const variables = existingServices?.variables ?? new LocalVariablesService()
    return {
      ...existingServices,
      config,
      logger,
      variables,
      schema: existingServices?.schema ?? new CFWorkerSchemaService(logger),
      secrets: existingServices?.secrets ?? new LocalSecretService(variables),
      kysely: existingServices!.kysely!,
      content: existingServices!.content!,
      scopeService: { resolveScopes: grantsOf } as unknown as ScopeService,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => ({}) as any)
