# Pikku Workflows Template (AWS Lambda + DynamoDB)

This template demonstrates Pikku workflows with DynamoDB state storage and SQS queue for AWS Lambda deployment.

## Quick Start

### Local Development

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Configure AWS credentials (LocalStack or real AWS):

   ```bash
   export AWS_REGION=us-east-1
   # For LocalStack:
   export AWS_ENDPOINT=http://localhost:4566
   # For real AWS, configure credentials as usual
   ```

3. Create DynamoDB tables:

   ```bash
   # Tables needed:
   # - workflow-runs (PK: id)
   # - workflow-steps (PK: runStepKey, GSI: runId-index on runId)
   # - workflow-step-history (PK: stepId, SK: attemptCount)
   ```

4. Start the local development server:

   ```bash
   yarn start
   ```

### AWS Lambda Deployment

The template includes Lambda handlers for:

- HTTP requests (`src/handler.ts` - `httpHandler`)
- SQS queue workers (`src/handler.ts` - `queueHandler`)

Deploy using your preferred method (SAM, CDK, Serverless Framework, etc.).

## Workflow Examples

See `../functions/src/workflow.functions.ts` and `../functions/src/workflow.wiring.ts` for example workflow definitions.

## Documentation

For complete workflow documentation, see:

- **[Workflows Guide](https://pikku.dev/docs/workflows)** - Overview and core concepts
- **[Getting Started](https://pikku.dev/docs/workflows/getting-started)** - Setup and configuration
- **[Step Types](https://pikku.dev/docs/workflows/steps)** - RPC, inline, sleep steps, and retry options
- **[Configuration](https://pikku.dev/docs/workflows/configuration)** - State storage and execution modes

## Features

- Multi-step workflow orchestration with deterministic replay
- Step caching and retry logic
- DynamoDB state storage with SQS queue
- AWS Lambda optimized (cold start friendly)
- Automatic execution mode detection (remote/inline)

## Architecture

```
┌─────────────┐
│   API GW    │
└─────┬───────┘
      │
      v
┌─────────────┐      ┌─────────────┐
│   Lambda    │─────>│  DynamoDB   │
│  (HTTP)     │      │  (State)    │
└─────┬───────┘      └─────────────┘
      │
      v
┌─────────────┐      ┌─────────────┐
│     SQS     │─────>│   Lambda    │
│   Queue     │      │  (Worker)   │
└─────────────┘      └─────────────┘
```

## Environment Variables

- `AWS_REGION` - AWS region (default: us-east-1)
- `AWS_ENDPOINT` - Optional AWS endpoint (for LocalStack)
- `RUNS_TABLE_NAME` - DynamoDB table for workflow runs (default: workflow-runs)
- `STEPS_TABLE_NAME` - DynamoDB table for workflow steps (default: workflow-steps)
- `HISTORY_TABLE_NAME` - DynamoDB table for step history (default: workflow-step-history)
- `QUEUE_URL_PREFIX` - SQS queue URL prefix (e.g., https://sqs.us-east-1.amazonaws.com/123456789/)
