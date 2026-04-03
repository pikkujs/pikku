/**
 * Generates a single serverless.yml for the entire project.
 *
 * Maps Pikku deployment concepts to Serverless Framework configuration:
 * - HTTP routes → httpApi events
 * - SQS queues → sqs events + CloudFormation resources
 * - Cron schedules → schedule events
 * - WebSocket channels → websocket events
 * - Secrets → SSM Parameter Store references
 * - Object storage → S3 bucket resources
 */

import type { ServerlessInfraManifest } from './types.js'

export function generateServerlessYml(
  manifest: ServerlessInfraManifest
): string {
  const lines: string[] = []
  const projectId = manifest.projectId

  // Header
  lines.push(`service: ${projectId}`)
  lines.push('')
  lines.push('frameworkVersion: "3"')
  lines.push('')

  // Provider
  lines.push('provider:')
  lines.push('  name: aws')
  lines.push('  runtime: nodejs20.x')
  lines.push("  stage: ${opt:stage, 'dev'}")
  lines.push("  region: ${opt:region, 'us-east-1'}")
  lines.push('  memorySize: 256')
  lines.push('  timeout: 30')

  // HTTP API cors
  const hasHttpRoutes = Object.values(manifest.units).some((u) =>
    u.handlerTypes.includes('fetch')
  )
  if (hasHttpRoutes) {
    lines.push('  httpApi:')
    lines.push('    cors: true')
  }

  // Global environment — secrets via SSM + variables
  lines.push('  environment:')
  for (const secret of manifest.secrets) {
    lines.push(
      `    ${secret.id}: \${ssm:/${projectId}/\${self:provider.stage}/${secret.id}}`
    )
  }
  for (const variable of manifest.variables) {
    lines.push(`    ${variable.id}: \${self:custom.${variable.id}, ''}`)
  }

  // IAM role statements
  const iamStatements = buildIamStatements(manifest)
  if (iamStatements.length > 0) {
    lines.push('  iam:')
    lines.push('    role:')
    lines.push('      statements:')
    for (const statement of iamStatements) {
      lines.push(`        - Effect: ${statement.effect}`)
      lines.push(
        `          Action: [${statement.actions.map((a) => `"${a}"`).join(', ')}]`
      )
      lines.push(`          Resource: [${statement.resources.join(', ')}]`)
    }
  }

  lines.push('')

  // Package — individually packaged per function
  lines.push('package:')
  lines.push('  individually: true')
  lines.push('')

  // Plugins — serverless-offline for local dev
  lines.push('plugins:')
  if (manifest.resources.sqsQueues.length > 0) {
    lines.push('  - serverless-offline-sqs')
  }
  lines.push('  - serverless-offline')
  lines.push('')

  // Custom variables section + offline config
  lines.push('custom:')
  for (const variable of manifest.variables) {
    lines.push(`  ${variable.id}: ""`)
  }
  // serverless-offline config
  lines.push('  serverless-offline:')
  lines.push('    httpPort: 4003')
  lines.push('    websocketPort: 4004')
  lines.push('    lambdaPort: 4005')
  lines.push('    noPrependStageInUrl: true')
  // serverless-offline-sqs config (uses ElasticMQ locally)
  if (manifest.resources.sqsQueues.length > 0) {
    lines.push('  serverless-offline-sqs:')
    lines.push('    autoCreate: true')
    lines.push("    apiVersion: '2012-11-05'")
    lines.push('    endpoint: http://0.0.0.0:9324')
    lines.push('    region: ${self:provider.region}')
    lines.push("    accessKeyId: 'root'")
    lines.push("    secretAccessKey: 'root'")
  }
  lines.push('')

  // Functions
  lines.push('functions:')
  for (const [unitName, unit] of Object.entries(manifest.units)) {
    generateFunctionBlock(lines, unitName, unit, manifest)
  }

  // Resources
  const resourceLines = generateResources(manifest)
  if (resourceLines.length > 0) {
    lines.push('')
    lines.push('resources:')
    lines.push('  Resources:')
    lines.push(...resourceLines)
  }

  lines.push('')
  return lines.join('\n')
}

function generateFunctionBlock(
  lines: string[],
  unitName: string,
  unit: ServerlessInfraManifest['units'][string],
  manifest: ServerlessInfraManifest
): void {
  const safeName = toCamelCase(unitName)

  if (unit.role === 'channel') {
    // WebSocket units need three separate function entries
    generateWebSocketFunctions(lines, unitName, safeName, manifest)
    return
  }

  lines.push(`  ${safeName}:`)
  lines.push(`    handler: ${unitName}/bundle.handler`)
  lines.push(`    package:`)
  lines.push(`      patterns:`)
  lines.push(`        - ${unitName}/**`)

  // Per-function environment
  const envLines = buildUnitEnvironment(unitName, unit, manifest)
  if (envLines.length > 0) {
    lines.push(`    environment:`)
    for (const env of envLines) {
      lines.push(`      ${env}`)
    }
  }

  // Events
  const events = buildEvents(unitName, unit, manifest)
  if (events.length > 0) {
    lines.push(`    events:`)
    for (const event of events) {
      lines.push(`      ${event}`)
    }
  }

  lines.push('')
}

function generateWebSocketFunctions(
  lines: string[],
  unitName: string,
  safeName: string,
  manifest: ServerlessInfraManifest
): void {
  const routes = [
    { name: 'connect', route: '$connect', handler: 'connect' },
    { name: 'disconnect', route: '$disconnect', handler: 'disconnect' },
    { name: 'default', route: '$default', handler: 'default' },
  ]

  for (const route of routes) {
    lines.push(`  ${safeName}${toPascalCase(route.name)}:`)
    lines.push(`    handler: ${unitName}/bundle.${route.handler}`)
    lines.push(`    package:`)
    lines.push(`      patterns:`)
    lines.push(`        - ${unitName}/**`)
    lines.push(`    events:`)
    lines.push(`      - websocket:`)
    lines.push(`          route: ${route.route}`)
    lines.push('')
  }
}

function buildEvents(
  unitName: string,
  unit: ServerlessInfraManifest['units'][string],
  manifest: ServerlessInfraManifest
): string[] {
  const events: string[] = []

  // HTTP routes
  for (const route of unit.routes) {
    const method = route.method.toUpperCase()
    // Convert Pikku route params (:id) to API Gateway format ({id})
    const path = route.route.replace(/:(\w+)/g, '{$1}')
    events.push(`- httpApi:`)
    events.push(`    method: ${method}`)
    events.push(`    path: ${path}`)
  }

  // If unit has fetch handler but no explicit routes, add a catch-all
  // for RPC access (used by gateways for /__pikku/rpc)
  if (
    unit.handlerTypes.includes('fetch') &&
    unit.routes.length === 0 &&
    (unit.role === 'function' ||
      unit.role === 'mcp' ||
      unit.role === 'agent' ||
      unit.role === 'workflow')
  ) {
    events.push(`- httpApi:`)
    events.push(`    method: ANY`)
    events.push(`    path: /__pikku/${unitName}/{proxy+}`)
  }

  // SQS queue consumers
  for (const queue of manifest.resources.sqsQueues) {
    if (queue.consumerUnit === unitName) {
      events.push(`- sqs:`)
      events.push(`    arn: !GetAtt ${queue.logicalName}Queue.Arn`)
      events.push(`    batchSize: 10`)
      events.push(`    functionResponseType: ReportBatchItemFailures`)
    }
  }

  // Scheduled events
  for (const rule of manifest.resources.eventBridgeRules) {
    if (rule.unit === unitName) {
      events.push(`- schedule:`)
      events.push(`    rate: cron(${toAwsCron(rule.schedule)})`)
      events.push(`    name: ${manifest.projectId}-${rule.name}`)
    }
  }

  return events
}

function buildUnitEnvironment(
  unitName: string,
  unit: ServerlessInfraManifest['units'][string],
  manifest: ServerlessInfraManifest
): string[] {
  const envLines: string[] = []

  // SQS queue URLs for units that need queue capability
  if (unit.capabilities.includes('queue')) {
    for (const queue of manifest.resources.sqsQueues) {
      const envKey = `SQS_QUEUE_URL_${toScreamingSnake(queue.name)}`
      envLines.push(`${envKey}: !Ref ${queue.logicalName}Queue`)
    }
  }

  // Lambda function names for gateway units (remote RPC)
  if (unit.dependsOn.length > 0) {
    for (const dep of unit.dependsOn) {
      const envKey = `LAMBDA_FUNC_${toScreamingSnake(dep)}`
      const lambdaRef = toCamelCase(dep)
      // Serverless Framework auto-generates logical IDs as <FunctionName>LambdaFunction
      envLines.push(
        `${envKey}: !Ref ${lambdaRef.charAt(0).toUpperCase() + lambdaRef.slice(1)}LambdaFunction`
      )
    }
  }

  // S3 bucket name for units needing object-storage
  if (
    unit.capabilities.includes('object-storage') &&
    manifest.resources.s3Buckets.length > 0
  ) {
    envLines.push(
      `S3_BUCKET_NAME: !Ref ${toPascalCase(manifest.resources.s3Buckets[0].name)}Bucket`
    )
  }

  return envLines
}

function buildIamStatements(manifest: ServerlessInfraManifest): IamStatement[] {
  const statements: IamStatement[] = []

  // SQS send permissions
  if (manifest.resources.sqsQueues.length > 0) {
    statements.push({
      effect: 'Allow',
      actions: ['sqs:SendMessage', 'sqs:GetQueueAttributes'],
      resources: manifest.resources.sqsQueues.map(
        (q) => `!GetAtt ${q.logicalName}Queue.Arn`
      ),
    })
  }

  // Lambda invoke for remote RPC
  const hasGateways = Object.values(manifest.units).some(
    (u) => u.dependsOn.length > 0
  )
  if (hasGateways) {
    statements.push({
      effect: 'Allow',
      actions: ['lambda:InvokeFunction'],
      resources: [
        '"arn:aws:lambda:${self:provider.region}:*:function:${self:service}-${self:provider.stage}-*"',
      ],
    })
  }

  // S3 permissions
  if (manifest.resources.s3Buckets.length > 0) {
    const bucket = manifest.resources.s3Buckets[0]
    const logicalName = `${toPascalCase(bucket.name)}Bucket`
    statements.push({
      effect: 'Allow',
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      resources: [
        `!GetAtt ${logicalName}.Arn`,
        `!Join ["", [!GetAtt ${logicalName}.Arn, "/*"]]`,
      ],
    })
  }

  return statements
}

function generateResources(manifest: ServerlessInfraManifest): string[] {
  const lines: string[] = []

  // SQS queues + DLQ
  for (const queue of manifest.resources.sqsQueues) {
    // Dead letter queue
    lines.push(`    ${queue.logicalName}DLQ:`)
    lines.push(`      Type: AWS::SQS::Queue`)
    lines.push(`      Properties:`)
    lines.push(`        QueueName: ${queue.name}-dlq-\${self:provider.stage}`)
    lines.push(`        MessageRetentionPeriod: 1209600`) // 14 days
    lines.push('')

    // Main queue
    lines.push(`    ${queue.logicalName}Queue:`)
    lines.push(`      Type: AWS::SQS::Queue`)
    lines.push(`      Properties:`)
    lines.push(`        QueueName: ${queue.name}-\${self:provider.stage}`)
    lines.push(`        VisibilityTimeout: 900`) // 15 min (match Lambda max)
    lines.push(`        RedrivePolicy:`)
    lines.push(
      `          deadLetterTargetArn: !GetAtt ${queue.logicalName}DLQ.Arn`
    )
    lines.push(`          maxReceiveCount: 3`)
    lines.push('')
  }

  // S3 buckets
  for (const bucket of manifest.resources.s3Buckets) {
    const logicalName = `${toPascalCase(bucket.name)}Bucket`
    lines.push(`    ${logicalName}:`)
    lines.push(`      Type: AWS::S3::Bucket`)
    lines.push(`      Properties:`)
    lines.push(`        BucketName: ${bucket.name}-\${self:provider.stage}`)
    lines.push('')
  }

  return lines
}

interface IamStatement {
  effect: string
  actions: string[]
  resources: string[]
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function toScreamingSnake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase()
}

/**
 * Converts a 5-field UNIX cron to 6-field AWS EventBridge cron.
 * UNIX: minute hour day-of-month month day-of-week
 * AWS:  minute hour day-of-month month day-of-week year
 *
 * If day-of-week is not *, set day-of-month to ?. Otherwise set day-of-week to ?.
 * AWS requires exactly one of day-of-month or day-of-week to be ?.
 */
function toAwsCron(schedule: string): string {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length >= 6) return schedule // Already AWS format

  if (parts.length === 5) {
    const [minute, hour, dom, month, dow] = parts
    if (dow !== '*') {
      // Day-of-week is set, so day-of-month must be ?
      return `${minute} ${hour} ? ${month} ${dow} *`
    }
    // Day-of-week is *, replace with ?
    return `${minute} ${hour} ${dom} ${month} ? *`
  }

  return schedule
}
