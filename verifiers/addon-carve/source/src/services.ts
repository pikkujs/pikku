import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku'
import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'
import { Kysely } from 'kysely'
import type { DB } from '../types/db.types.js'

import '../.pikku/pikku-bootstrap.gen.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

export const createSingletonServices = pikkuServices(async (config) => {
  const variables = new LocalVariablesService()

  return {
    config,
    logger: new ConsoleLogger(),
    variables,
    secrets: new LocalSecretService(variables),
    // Typed only — the source project is inspected/codegen'd, never booted.
    kysely: new Kysely<DB>({ dialect: {} as any }),
    email: { send: async () => {} },
    clock: { now: () => new Date() },
    auditLogger: new ConsoleLogger(),
  }
})

export const createWireServices = pikkuWireServices(async ({ logger }) => {
  return {} as any
})
