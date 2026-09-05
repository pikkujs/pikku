import {
  JsonConsoleLogger,
  LocalEmailService,
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
import { GeneratedTemplateEmailService } from './lib/email-service.js'
import type { DB } from '#pikku/db/schema.gen.js'

// @snippet start shopServices
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
    const emailService =
      existingServices?.emailService ??
      new GeneratedTemplateEmailService({
        delegate: new LocalEmailService(),
      })
    // The durable audit sink. In a deployed stage fabric injects the platform's
    // audit service; locally it falls back to a no-op so nothing is persisted.
    const audit = existingServices?.audit ?? new NoopAuditService()
    // kysely is injected by pikku dev (node:sqlite) or the CF Worker workflow (libsql).
    // The template never constructs its own dialect — dialects are fabric/runtime
    // concerns — so it must always be provided by the runtime.
    if (!existingServices?.kysely) {
      throw new Error(
        'kysely service was not injected by the runtime (pikku dev / fabric)'
      )
    }
    const kysely: Kysely<DB> = existingServices.kysely

    // Per-user credential store (wire.getCredential) — needed by addons imported
    // with --auth per-user/delegated. A deployed stage injects it: credentials are
    // sealed to the stage, and only its secrets Worker holds the key. There is no
    // fallback because there is no key to fall back to — the template used to
    // build a `KyselyCredentialService` from a `CREDENTIALS_KEY` secret, which was
    // the stage's own KEK handed to every unit. Outside a stage the app runs fine
    // and credential-using addon calls fail with a clear error from the addon's
    // wire services; wire your own `credentialService` here if you need one.
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
      emailService,
      audit,
      kysely,
      // Constructed once here rather than read per call: the payment provider's
      // credentials belong to service construction, and functions cannot reach
      // `secrets` at all (every function-facing services type is bounded by
      // SecretlessServices).
      ...(credentialService ? { credentialService } : {}),
    }
  }
)
// @snippet end shopServices

// @snippet start shopWireServices
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
// @snippet end shopWireServices
