# @pikku/aws-services

AWS service implementations for Pikku — S3 content storage, Secrets Manager and
SQS queues.

The AWS SDK clients are peer dependencies, so you only install the ones you use.

## Install

```bash
npm install @pikku/aws-services @aws-sdk/client-s3
```

## Usage

```typescript
import { S3Content, AWSSecrets } from '@pikku/aws-services'

const content = new S3Content(config, logger)
const secrets = new AWSSecrets(config, logger)
```

## Docs

https://pikku.dev/docs
