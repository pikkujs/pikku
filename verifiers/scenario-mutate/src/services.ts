import {
  JsonConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
  NoopAuditService,
  createInvocationAudit,
} from '@pikku/core/services'
import { createAuditedKysely } from '@pikku/kysely'
import { pikkuServices, pikkuWireServices } from '#pikku/setup'
import { TypedSecretService } from '../.pikku/secrets/pikku-secrets.gen.js'
import { TypedVariablesService } from '../.pikku/variables/pikku-variables.gen.js'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { Kysely } from 'kysely'
import type { DB } from '#pikku/db/schema.gen.js'

export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const variables =
      existingServices?.variables ??
      new TypedVariablesService(new LocalVariablesService())
    const secrets =
      existingServices?.secrets ??
      new TypedSecretService(new LocalSecretService(variables))
    const logger = existingServices?.logger ?? new JsonConsoleLogger()
    const schema = existingServices?.schema ?? new CFWorkerSchemaService(logger)
    const audit = existingServices?.audit ?? new NoopAuditService()
    if (!existingServices?.kysely) {
      throw new Error(
        'kysely service was not injected by the runtime (pikku dev / cloud)'
      )
    }
    const kysely: Kysely<DB> = existingServices.kysely

    const credentialService = existingServices?.credentialService

    return {
      ...(existingServices ?? {}),
      config,
      workflowService: existingServices?.workflowService,
      workflowRunService: existingServices?.workflowRunService,
      variables,
      secrets,
      schema,
      logger,
      audit,
      kysely,
      ...(credentialService ? { credentialService } : {}),
    }
  }
)

export const createWireServices = pikkuWireServices(
  async (singletonServices, wire) => {
    if (!singletonServices.audit) {
      return {}
    }
    const auditLog = createInvocationAudit(singletonServices.audit, wire)
    // auditLog is ALWAYS injected, but `auditLog.write(...)` only PERSISTS when this
    // function set `audit: true` — createInvocationAudit gates on wire.audit, so
    // without it write() is a warn-only no-op (see @pikku/core audit-service.ts).
    // `auditLog.config` is set ONLY when audit: true is on, and when it is, ALSO wrap
    // kysely so every query is captured and the runner flushes the buffer on close.
    // Without audit: true, leave the plain kysely untouched — no per-query overhead.
    if (!auditLog.config) {
      return { auditLog }
    }
    return {
      auditLog,
      kysely: createAuditedKysely(singletonServices.kysely, {
        audit: auditLog,
      }),
    }
  }
)
