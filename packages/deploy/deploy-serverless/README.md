# @pikku/deploy-serverless

Serverless Framework deploy adapter for Pikku. Generates `serverless.yml`,
Lambda entry points and the infra manifest for deploying to AWS.

Build-time only — it never runs inside the Lambda. The runtime counterpart is
`@pikku/lambda`.

## Install

```bash
npm install -D @pikku/deploy-serverless
```

## Usage

```bash
npx pikku deploy --provider serverless
```

## Docs

https://pikku.dev/docs
