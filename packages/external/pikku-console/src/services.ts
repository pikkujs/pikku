import { pikkuExternalServices } from '#pikku'
import { getPikkuMetaDir } from '@pikku/core'
import { WiringService } from './services/wiring.service.js'
import { ExternalService } from './services/external.service.js'
import { SchemaService } from './services/schema.service.js'
import { OAuthService } from './services/oauth.service.js'
import { FileWatcherService } from './services/file-watcher.service.js'
import {
  PgWorkflowService,
  PgWorkflowRunService,
  PgAgentRunService,
  PgAIStorageService,
  PgDeploymentService,
} from '@pikku/pg'
import postgres from 'postgres'

export const createSingletonServices = pikkuExternalServices(
  async (_config, { variables, aiAgentRunner, schedulerService }) => {
    const pikkuMetaPath = getPikkuMetaDir() ?? ''
    const externalPackagesPath =
      (await variables.get('EXTERNAL_PACKAGES_PATH')) ?? ''

    const wiringService = new WiringService(pikkuMetaPath)
    const schemaService = new SchemaService(pikkuMetaPath)
    const externalService = new ExternalService(externalPackagesPath)
    await externalService.init()
    const oauthService = new OAuthService()
    const fileWatcherService = new FileWatcherService(
      pikkuMetaPath,
      wiringService,
      schemaService
    )
    fileWatcherService.start()

    const workflowDbUrl = await variables.get('WORKFLOW_DB_URL')
    let workflowService: PgWorkflowService | undefined
    let workflowRunService: PgWorkflowRunService | undefined
    let agentRunService: PgAgentRunService | undefined
    let aiStorage: PgAIStorageService | undefined
    let deploymentService: PgDeploymentService | undefined
    if (workflowDbUrl) {
      const sql = postgres(workflowDbUrl)
      workflowService = new PgWorkflowService(sql)
      await workflowService.init()
      workflowRunService = new PgWorkflowRunService(sql)
      agentRunService = new PgAgentRunService(sql)
      aiStorage = new PgAIStorageService(sql)
      await aiStorage.init()
      deploymentService = new PgDeploymentService({}, sql)
      await deploymentService.init()
    }

    return {
      wiringService,
      externalService,
      schemaService,
      oauthService,
      fileWatcherService,
      workflowService,
      workflowRunService,
      agentRunService,
      aiStorage,
      aiRunState: aiStorage,
      deploymentService,
      aiAgentRunner,
      schedulerService,
    }
  }
)
