import {
  JsonConsoleLogger,
  LocalEmailService,
  LocalSecretService,
  LocalVariablesService,
  NoopAuditService,
  createInvocationAudit,
} from '@pikku/core/services'
import {
  createAuditedKysely,
  KyselyAgentRunService,
  KyselyAgentStorageService,
  KyselyScopeService,
} from '@pikku/kysely'
import { SQLiteKyselyWorkflowService } from '@pikku/kysely-sqlite'
import { KyselyLeaseService } from '@pikku/kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'
import { pikkuServices, pikkuWireServices } from '#pikku/setup'
import { SCOPES } from '#pikku/scopes/pikku-scopes.gen.js'
import { SYSTEM_ROLES } from '#pikku/scopes/pikku-roles.gen.js'
import { TypedSecretService } from '../.pikku/secrets/pikku-secrets.gen.js'
import { TypedVariablesService } from '../.pikku/variables/pikku-variables.gen.js'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { Kysely } from 'kysely'
import type { VercelAgentRunner } from '@pikku/ai-vercel'
import type { DB } from '#pikku/db/schema.gen.js'

// @snippet start shopServices
export const createSingletonServices = pikkuServices(async (config, existingServices) => {
  const variables =
    existingServices?.variables ?? new TypedVariablesService(new LocalVariablesService())
  const secrets =
    existingServices?.secrets ?? new TypedSecretService(new LocalSecretService(variables))
  const logger = existingServices?.logger ?? new JsonConsoleLogger()
  const schema = existingServices?.schema ?? new CFWorkerSchemaService(logger)
  const emailService =
    existingServices?.emailService ?? new LocalEmailService()
  // The durable audit sink. In a deployed stage fabric injects the platform's
  // audit service; locally it falls back to a no-op so nothing is persisted.
  const audit = existingServices?.audit ?? new NoopAuditService()
  // kysely is injected by pikku dev (node:sqlite) or the CF Worker workflow (libsql).
  // The template never constructs its own dialect — dialects are fabric/runtime
  // concerns — so it must always be provided by the runtime.
  if (!existingServices?.kysely) {
    throw new Error('kysely service was not injected by the runtime (pikku dev / fabric)')
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

  const litellmProxyUrl = process.env.LITELLM_PROXY_URL ?? null
  const litellmApiKey = process.env.LITELLM_API_KEY ?? null
  let agentRunner: VercelAgentRunner | undefined
  if (litellmProxyUrl && litellmApiKey) {
    // The AI SDKs (~3MB) are stubbed out of non-agent units at bundle time —
    // only units with the `ai-model` capability keep them. So import them
    // dynamically and guard on the module resolving to a real export; in a
    // stubbed unit the import yields `{}` and the runner is simply not built.
    const aiVercel = await import('@pikku/ai-vercel')
    const aiSdk = await import('@ai-sdk/openai-compatible')
    if (aiVercel.VercelAgentRunner && aiSdk.createOpenAICompatible) {
      const litellmProvider = aiSdk.createOpenAICompatible({
        name: 'litellm',
        baseURL: litellmProxyUrl,
        apiKey: litellmApiKey,
      })
      agentRunner = new aiVercel.VercelAgentRunner({
        openai: (modelId: string) => litellmProvider.chatModel(modelId),
        anthropic: (modelId: string) => litellmProvider.chatModel(modelId),
        google: (modelId: string) => litellmProvider.chatModel(modelId),
        deepseek: (modelId: string) => litellmProvider.chatModel(modelId),
      })
    }
  }

  // Without a ScopeService no user can hold any scope, so every function that
  // requires one denies everybody — `defineScope`, `defineSystemRole` and the
  // role grants `pikku persona sync` writes all exist and none of them reach a
  // request. It resolves userId -> roles -> scopes out of the four pikku_* tables.
  //
  // Built as the concrete class rather than the `ScopeService` interface because
  // `init()` is the implementation's, not the contract's. It *requires* the four
  // tables rather than creating them, and throws pointing at `pikku db generate`
  // if they are missing. The cast is the app's own `DB` — which
  // includes the pikku_* tables — against the narrower shape the service
  // declares; the two differ only in kysely's internal builder generics.
  let scopeService = existingServices?.scopeService
  if (!scopeService) {
    const kyselyScopes = new KyselyScopeService(kysely as unknown as Kysely<KyselyPikkuDB>)
    await kyselyScopes.init()
    scopeService = kyselyScopes
  }

  // The definitions in scopes.ts and roles.ts are declarations until something
  // writes them down. Nothing else does, and a role with no row cannot be
  // granted — `addUserToRole` fails the pikku_role_scopes foreign key, which is
  // how persona provisioning discovers it.
  await scopeService.syncScopes(SCOPES)
  await scopeService.syncSystemRoles(SYSTEM_ROLES)

  // Workflows are declared in this project, so a workflowService is not
  // optional — without one the CLI refuses to generate (PKU600) and a run has
  // nowhere to keep its state between steps.
  // The workflow service serialises orchestration and step claims on a lease, so
  // it is built over the same lease service the app registers.
  const leaseService =
    existingServices?.leaseService ??
    new KyselyLeaseService(kysely as unknown as Kysely<KyselyPikkuDB>)
  await (leaseService as { init?: () => Promise<void> }).init?.()

  const workflowService =
    existingServices?.workflowService ??
    new SQLiteKyselyWorkflowService(kysely as any, { leaseService })
  await (workflowService as { init?: () => Promise<void> }).init?.()

  // The shop assistant declares `memory`, and memory is only ever as durable as
  // the storage behind it — with no `agentStorage` registered the agent still
  // answers, it just forgets between turns. One instance covers `agentStorage`
  // and `agentRunState`: KyselyAgentStorageService implements both, and threads
  // and runs share the same tables, so splitting them across two instances would
  // only duplicate the connection. `init()` requires the agent_* tables (created
  // by db/sqlite/0005-pikku-runtime.sql) rather than creating them.
  const agentStorage =
    (existingServices?.agentStorage as KyselyAgentStorageService | undefined) ??
    new KyselyAgentStorageService(kysely as unknown as Kysely<KyselyPikkuDB>)
  await agentStorage.init()

  // Read-only, and only the Console reads it — the agent itself never does.
  const agentRunService =
    existingServices?.agentRunService ??
    new KyselyAgentRunService(kysely as unknown as Kysely<KyselyPikkuDB>)

  return {
    ...(existingServices ?? {}),
    config,
    scopeService,
    workflowService,
    leaseService,
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
    ...(agentRunner ? { agentRunner } : {}),
    agentStorage,
    agentRunState: agentStorage,
    agentRunService,
  }
})
// @snippet end shopServices

// @snippet start shopWireServices
export const createWireServices = pikkuWireServices(async (singletonServices, wire) => {
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
    kysely: createAuditedKysely(singletonServices.kysely, { audit: auditLog }),
  }
})
// @snippet end shopWireServices
