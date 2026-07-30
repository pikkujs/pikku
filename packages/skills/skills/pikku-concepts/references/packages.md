# Available Pikku Packages

## Runtime Adapters

| Package                       | Use Case                              |
| ----------------------------- | ------------------------------------- |
| `@pikku/express-server`       | Express standalone server             |
| `@pikku/express-middleware`   | Express as middleware in existing app |
| `@pikku/fastify-server`       | Fastify standalone                    |
| `@pikku/fastify-plugin`       | Fastify plugin                        |
| `@pikku/next`                 | Next.js API routes                    |
| `@pikku/aws-lambda`           | AWS Lambda handlers                   |
| `@pikku/cloudflare`           | Cloudflare Workers                    |
| `@pikku/uws-server`           | uWebSockets.js (high perf)            |
| `@pikku/modelcontextprotocol` | MCP server                            |

## Service Packages

| Package                  | Provides                                             |
| ------------------------ | ---------------------------------------------------- |
| `@pikku/jose`            | JWT (sign/verify) via jose library                   |
| `@pikku/schema-ajv`      | Schema validation via AJV                            |
| `@pikku/schema-cfworker` | Schema validation for Cloudflare                     |
| `@pikku/pino`            | Structured logging via Pino                          |
| `@pikku/kysely`          | Type-safe SQL via Kysely (PostgreSQL, SQLite, MySQL) |
| `@pikku/redis`           | Redis client                                         |
| `@pikku/queue-bullmq`    | Job queues via BullMQ                                |
| `@pikku/queue-pg-boss`   | Job queues via PgBoss                                |
| `@pikku/aws-services`    | AWS SDK (SQS, DynamoDB, etc.)                        |
