import { pikkuAddonServices } from '#pikku/addon/setup'
import { WiringService } from './services/wiring.service.js'
import { AddonService } from './services/addon.service.js'
import { AddonReadinessService } from './services/addon-readiness.service.js'
import type { CodeEditService } from '@pikku/code-edit'
import { StateDiffService } from './services/state-diff.service.js'
import { DbSchemaService } from './services/db-schema.service.js'
import { KnowledgeService } from './services/knowledge.service.js'
import { SecretAdminService } from './services/secret-admin.service.js'
import { I18nService } from '@pikku/code-edit/i18n'
import { findWorkspaceRoot } from '@pikku/code-edit/workspace'
import { WorkspaceFilesService } from '@pikku/code-edit/files'
import { GitService } from '@pikku/code-edit/git'
import { PagesService } from '@pikku/code-edit/routes'
import { PageScreenshotService } from './services/page-screenshot.service.js'
import type { TypeScriptService } from '@pikku/code-edit/typescript'
import { VerifyService } from '@pikku/code-edit/verify'
import { resolveStudioHost, type StudioHost } from './services/studio-host.service.js'
import { DesignService } from './services/design.service.js'
import { BrandWorkspace } from '@pikku/code-edit/brand'
import { findProjectRoot } from './lib/find-project-root.js'
import { join } from 'node:path'
import { FileScenarioRunStore } from '@pikku/core/services/file-scenario-run-store'

export const createSingletonServices = pikkuAddonServices(
  async (
    _config,
    {
      variables,
      secrets,
      metaService: existingMetaService,
      agentRunner,
      schedulerService,
      queueService,
      agentRunService,
      workflowService,
      workflowRunService,
      agentStorage,
      agentRunState,
      deploymentService,
      credentialService,
      coverageService,
      webhookService,
      incomingWebhookService,
      auth,
    }
  ) => {
    if (!existingMetaService) {
      throw new Error(
        'metaService is required for the console addon. Set it in your createSingletonServices using PikkuMetaService from #pikku/services/pikku-meta-service.gen.js'
      )
    }
    const metaService = existingMetaService
    const cloudApiUrl =
      (await variables.get('PIKKUSTUDIO_API_URL')) ?? 'https://api.pikkustudio.app'

    const wiringService = new WiringService(metaService)
    const secretAdminService = new SecretAdminService(secrets)
    const addonService = new AddonService(cloudApiUrl)
    await addonService.init()
    const addonReadinessService = new AddonReadinessService(secrets, variables)

    const metaBasePath = existingMetaService?.basePath
    let codeEditService: CodeEditService | null = null
    let stateDiffService: StateDiffService | null = null
    let dbSchemaService: DbSchemaService | null = null
    let knowledgeService: KnowledgeService | null = null
    let i18nService: I18nService | null = null
    let designService: DesignService | null = null
    let brandService: BrandWorkspace | null = null
    let studioHost: StudioHost | null = null
    let verifyService: VerifyService | null = null
    let typeScriptService: TypeScriptService | null = null
    let pagesService: PagesService | null = null
    let pageScreenshotService: PageScreenshotService | null = null
    let gitService: GitService | null = null
    let workspaceFilesService: WorkspaceFilesService | null = null
    let scenarioRunStore: FileScenarioRunStore | null = null
    if (metaBasePath) {
      const projectRoot = findProjectRoot(metaBasePath)
      stateDiffService = new StateDiffService(projectRoot)
      dbSchemaService = new DbSchemaService(metaService)
      knowledgeService = new KnowledgeService(projectRoot, metaBasePath)
      i18nService = new I18nService(findWorkspaceRoot(projectRoot))
      designService = new DesignService(findWorkspaceRoot(projectRoot))
      studioHost = await resolveStudioHost(projectRoot)
      verifyService = new VerifyService(projectRoot)
      try {
        const typeScriptPath = '@pikku/code-edit/typescript'
        const { TypeScriptService: Service } = await import(typeScriptPath)
        typeScriptService = new Service(findWorkspaceRoot(projectRoot))
      } catch {
        // typeScriptService stays null; get-file-diagnostics reports it unavailable.
      }
      pagesService = new PagesService(findWorkspaceRoot(projectRoot))
      pageScreenshotService = new PageScreenshotService(
        pagesService,
        projectRoot
      )
      gitService = new GitService(findWorkspaceRoot(projectRoot))
      workspaceFilesService = new WorkspaceFilesService(
        findWorkspaceRoot(projectRoot)
      )
      brandService = new BrandWorkspace(findWorkspaceRoot(projectRoot))
      // The same directory `pikku scenario run` writes to: the console reads
      // runs the CLI recorded, so the path is the contract between them.
      scenarioRunStore = new FileScenarioRunStore({
        dir: join(metaBasePath, 'scenario-runs'),
      })
      // code-edit.service pulls in the TypeScript compiler and is deliberately a
      // lazy, separately-bundled module. Self-contained bundles (e.g. the sandbox
      // orchestrator standalone artifact) don't ship it, so a failed import must
      // degrade to a null codeEditService — never crash every console RPC. The
      // update-* edit functions already guard on `if (!codeEditService) throw`.
      try {
        const codeEditPath = '@pikku/code-edit'
        const { CodeEditService } = await import(codeEditPath)
        codeEditService = new CodeEditService(projectRoot)
      } catch {
        // codeEditService stays null; write-time edit ops report it unavailable.
      }
    }

    return {
      variables,
      metaService,
      wiringService,
      secretAdminService,
      addonService,
      addonReadinessService,
      workflowService,
      workflowRunService,
      agentRunService,
      agentStorage,
      agentRunState,
      deploymentService,
      agentRunner,
      schedulerService,
      queueService,
      credentialService,
      coverageService,
      webhookService,
      incomingWebhookService,
      codeEditService,
      stateDiffService,
      dbSchemaService,
      knowledgeService,
      i18nService,
      designService,
      brandService,
      studioHost,
      verifyService,
      typeScriptService,
      pagesService,
      pageScreenshotService,
      gitService,
      workspaceFilesService,
      scenarioRunStore,
      auth,
    }
  }
)
