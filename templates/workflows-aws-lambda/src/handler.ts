import type { APIGatewayProxyEvent, SQSEvent } from 'aws-lambda'
import { runFetch } from '@pikku/lambda/http'
import { runSQSQueueWorker } from '@pikku/lambda/queue'
import { DynamoDBWorkflowService, SQSQueueService } from '@pikku/aws-services'
import {
  createConfig,
  createSessionServices,
  createSingletonServices,
} from './services.js'
import type { CoreSingletonServices } from '@pikku/core'
import '../.pikku/pikku-bootstrap.gen.js'

// Cached services for warm starts
let cachedServices: CoreSingletonServices | null = null

async function getSingletonServices(): Promise<CoreSingletonServices> {
  if (cachedServices) {
    return cachedServices
  }

  const config = await createConfig()

  // Create DynamoDB workflow service
  const workflowService = new DynamoDBWorkflowService({
    dynamoDBConfig: {
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT, // For LocalStack
    },
    runsTableName: process.env.RUNS_TABLE_NAME || 'workflow-runs',
    stepsTableName: process.env.STEPS_TABLE_NAME || 'workflow-steps',
    historyTableName: process.env.HISTORY_TABLE_NAME || 'workflow-step-history',
  })
  await workflowService.init()

  // Create SQS queue service
  const queueUrlPrefix =
    process.env.QUEUE_URL_PREFIX ||
    `https://sqs.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${process.env.AWS_ACCOUNT_ID}/`

  const queueService = new SQSQueueService({
    region: process.env.AWS_REGION || 'us-east-1',
    queueUrlPrefix,
    endpoint: process.env.AWS_ENDPOINT, // For LocalStack
  })

  // Create singleton services
  const singletonServices = await createSingletonServices(config, {
    queueService,
    workflowService,
  })

  // Set workflow service dependencies
  workflowService.setServices(
    singletonServices,
    createSessionServices as any,
    config
  )

  cachedServices = singletonServices
  return cachedServices
}

/**
 * HTTP Handler for API Gateway events
 * Handles workflow triggers and other HTTP requests
 */
export async function httpHandler(event: APIGatewayProxyEvent) {
  const singletonServices = await getSingletonServices()
  return await runFetch(singletonServices, createSessionServices, event)
}

/**
 * SQS Queue Handler for workflow job processing
 * Processes workflow steps from SQS queue
 */
export async function queueHandler(event: SQSEvent) {
  const singletonServices = await getSingletonServices()
  return await runSQSQueueWorker(
    singletonServices,
    createSessionServices,
    event
  )
}
