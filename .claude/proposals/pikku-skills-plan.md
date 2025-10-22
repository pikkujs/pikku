# Pikku Skills Creation Plan

**Date**: 2025-10-22
**Status**: Approved

## Overview

This document outlines the plan to create comprehensive Claude Code skills for all remaining Pikku functionality. The goal is to provide developers with context-aware guidance for every aspect of the Pikku framework.

## Current State

### Existing Skills (9)

1. **pikku-functions** - Core function patterns, permissions, middleware, RPC, services
2. **pikku-http** - HTTP wiring, routes, SSE (needs client usage section)
3. **pikku-channel** - WebSocket/channel wiring (needs client usage section)
4. **pikku-scheduler** - Scheduled task wiring
5. **pikku-queue** - Queue worker wiring (needs enqueue patterns section)
6. **pikku-mcp** - MCP resources, tools, prompts
7. **pikku-cli** - CLI command wiring (needs config section)
8. **pikku-auth-middleware** - Built-in auth middleware helpers
9. **pikku-yarn-workspace** - Monorepo organization

## Skills to Create

### Phase 1: Runtime Adapters (10 skills)

Runtime adapters handle server/handler setup, bootstrapping, and deployment.

#### 1. pikku-express

**Priority**: High
**Location**: `.claude/skills/pikku-express/`

**Content Outline**:

- When to use: Express.js applications, traditional web servers
- Installing dependencies (`@pikku/express-server` or `@pikku/express-middleware`)
- Server setup and bootstrapping
- Importing `pikku-bootstrap.gen`
- Configuration patterns
- Middleware integration (Express-specific)
- Error handling
- Development vs production setup
- Deployment patterns (PM2, Docker, traditional hosting)
- Examples: Basic server, with sessions, with database

#### 2. pikku-fastify

**Priority**: High
**Location**: `.claude/skills/pikku-fastify/`

**Content Outline**:

- When to use: High-performance APIs, microservices
- Installing dependencies (`@pikku/fastify-server` or `@pikku/fastify-plugin`)
- Server setup and bootstrapping
- Plugin vs server mode
- Fastify-specific patterns (decorators, hooks)
- Performance optimization
- Deployment patterns
- Examples: Basic server, plugin integration

#### 3. pikku-next

**Priority**: High
**Location**: `.claude/skills/pikku-next/`

**Content Outline**:

- When to use: Next.js applications, full-stack React apps
- Installing dependencies (`@pikku/next`)
- API routes integration (App Router and Pages Router)
- Route handlers setup
- Server actions patterns
- Middleware integration
- Edge runtime considerations
- Deployment (Vercel, self-hosted)
- Examples: API route, server action, edge function

#### 4. pikku-aws-lambda

**Priority**: High
**Location**: `.claude/skills/pikku-aws-lambda/`

**Content Outline**:

- When to use: Serverless on AWS
- Installing dependencies (`@pikku/aws-lambda`)
- Handler setup and exports
- Event mapping (API Gateway, ALB, EventBridge, SQS)
- Cold start optimization
- Environment variables and secrets
- IAM permissions
- Deployment (SAM, CDK, Serverless Framework)
- Examples: API Gateway handler, SQS handler, EventBridge handler

#### 5. pikku-cloudflare

**Priority**: High
**Location**: `.claude/skills/pikku-cloudflare/`

**Content Outline**:

- When to use: Edge compute, Cloudflare Workers
- Installing dependencies (`@pikku/cloudflare`)
- Worker setup and exports
- Bindings (KV, D1, R2, Durable Objects)
- Request handling patterns
- Limitations and workarounds
- Wrangler configuration
- Deployment patterns
- Examples: Basic worker, with KV, with D1

#### 6. pikku-uws

**Priority**: Medium
**Location**: `.claude/skills/pikku-uws/`

**Content Outline**:

- When to use: Extreme performance requirements, WebSocket-heavy apps
- Installing dependencies (`@pikku/uws-server` or `@pikku/uws-handler`)
- Server setup
- Performance tuning
- Memory management
- Deployment patterns
- Examples: HTTP server, WebSocket server

#### 7. pikku-azure-functions

**Priority**: Medium
**Location**: `.claude/skills/pikku-azure-functions/`

**Content Outline**:

- When to use: Serverless on Azure
- Installing dependencies (`@pikku/azure-functions`)
- Function app setup
- Trigger types (HTTP, Timer, Queue, Event Grid)
- Bindings configuration
- Deployment (Azure CLI, VS Code)
- Examples: HTTP trigger, timer trigger

#### 8. pikku-queue-bullmq

**Priority**: High
**Location**: `.claude/skills/pikku-queue-bullmq/`

**Content Outline**:

- When to use: Redis-based job queues, high throughput
- Installing dependencies (`@pikku/queue-bullmq`)
- Redis setup and configuration
- Queue worker setup
- Job options (priority, delay, repeat, backoff)
- Worker options (concurrency, rate limiting)
- Queue events and monitoring
- UI integration (Bull Dashboard)
- Deployment patterns
- Examples: Basic worker, with retries, scheduled jobs, job flow

#### 9. pikku-queue-pg-boss

**Priority**: Medium
**Location**: `.claude/skills/pikku-queue-pg-boss/`

**Content Outline**:

- When to use: PostgreSQL-based queues, simpler infrastructure
- Installing dependencies (`@pikku/queue-pg-boss`)
- PostgreSQL setup
- Queue worker setup
- Job options
- Worker configuration
- Deployment patterns
- Examples: Basic worker, with retries

#### 10. pikku-ws

**Priority**: Low
**Location**: `.claude/skills/pikku-ws/`

**Content Outline**:

- When to use: Standalone WebSocket servers
- Installing dependencies (`@pikku/ws`)
- Server setup
- Channel integration
- Deployment patterns
- Examples: Chat server, pub/sub

---

### Phase 2: Service Integrations (4 skills)

Service integrations show how to use specific infrastructure packages.

#### 11. pikku-kysely

**Priority**: High
**Location**: `.claude/skills/pikku-kysely/`

**Content Outline**:

- When to use: Type-safe SQL queries, PostgreSQL/MySQL/SQLite
- Installing dependencies (`@pikku/kysely`)
- Database setup and connection pooling
- PikkuKysely wrapper patterns
- Migration setup and patterns
- Type generation (kysely-codegen)
- Transaction patterns
- Query patterns
- Testing with in-memory DB
- Examples: Setup, migrations, queries, transactions

#### 12. pikku-pino

**Priority**: Medium
**Location**: `.claude/skills/pikku-pino/`

**Content Outline**:

- When to use: Structured logging, production-grade logging
- Installing dependencies (`@pikku/pino`)
- Logger setup and configuration
- Log levels and formatting
- Child loggers and context
- Pretty printing in development
- Log aggregation integration
- Examples: Basic setup, with context

#### 13. pikku-jose

**Priority**: High
**Location**: `.claude/skills/pikku-jose/`

**Content Outline**:

- When to use: JWT authentication, token-based auth
- Installing dependencies (`@pikku/jose`)
- JWT service setup
- Token generation and verification
- Claims and expiration
- Key management
- Refresh token patterns
- Examples: Login/logout, token refresh

#### 14. pikku-aws-services

**Priority**: Low
**Location**: `.claude/skills/pikku-aws-services/`

**Content Outline**:

- When to use: AWS integrations (S3, SES, SNS, etc.)
- Installing dependencies (`@pikku/aws-services`)
- Service setup patterns
- Common integrations (S3 uploads, SES emails)
- Examples: S3 upload, send email

---

### Phase 3: Developer Workflow (2 skills)

#### 15. pikku-testing

**Priority**: High
**Location**: `.claude/skills/pikku-testing/`

**Content Outline**:

- When to use: Writing tests for Pikku functions
- Test patterns (unit, integration, e2e)
- Testing functions directly (without wiring)
- Mocking services
- Testing with real services (test containers)
- Testing HTTP endpoints
- Testing WebSocket channels
- Testing queue workers
- Testing scheduled tasks
- Coverage and CI integration
- Examples: Unit test, integration test, HTTP test, channel test

#### 16. pikku-project-init

**Priority**: Medium
**Location**: `.claude/skills/pikku-project-init/`

**Content Outline**:

- When to use: Starting new Pikku projects
- Using `create-pikku` CLI
- Template options
- Project structure generated
- First steps after scaffolding
- Adding runtimes
- Adding services
- Examples: Create project, add Express backend

---

### Phase 4: Optional Skills (2 skills)

#### 17. pikku-security

**Priority**: Medium
**Location**: `.claude/skills/pikku-security/`

**Content Outline**:

- When to use: Implementing security best practices
- CORS configuration
- Rate limiting patterns
- Input validation
- SQL injection prevention
- XSS prevention
- CSRF protection
- API key management
- Examples: CORS setup, rate limiting middleware

#### 18. pikku-monitoring

**Priority**: Low
**Location**: `.claude/skills/pikku-monitoring/`

**Content Outline**:

- When to use: Production observability
- Logging patterns
- Metrics collection
- Tracing setup
- Error tracking (Sentry, etc.)
- APM integration
- Health checks
- Examples: Metrics middleware, error tracking

---

## Skills to Update

### 1. pikku-cli

**Add Section**: pikku.config.json Configuration

**Content to Add**:

- Configuration file structure
- `srcDirectories`, `outDir`, `fetchFile`, `websocketFile`
- `packageMappings` for monorepos
- `openAPI` configuration
- Filter patterns
- Watch mode settings
- Examples: Basic config, monorepo config, with filters

### 2. pikku-http

**Add Section**: HTTP Client Usage

**Content to Add**:

- Importing generated client
- Creating client instance (`createPikkuClient`)
- Making requests to typed endpoints
- Error handling
- Request/response types
- TypeScript autocompletion
- Examples: Basic client usage, error handling, file uploads

### 3. pikku-channel

**Add Section**: WebSocket Client Usage

**Content to Add**:

- Importing generated client
- Creating WebSocket connection
- Subscribing to channels
- Sending messages
- Handling incoming messages
- Connection lifecycle
- Error handling
- Reconnection patterns
- Examples: Connect, send/receive, subscription

### 4. pikku-queue

**Add Section**: Enqueuing Jobs from Functions

**Content to Add**:

- Accessing queue service
- Enqueuing jobs
- Job options (delay, priority)
- Bulk enqueuing
- Job status tracking
- Examples: Enqueue email job, scheduled job, bulk jobs

---

## Implementation Strategy

### Directory Structure

Each skill follows this pattern:

```
.claude/skills/[skill-name]/
  SKILL.md           # Main skill content
  examples/          # Code examples (optional, can be inline)
    example-1.ts
    example-2.ts
  config/            # Configuration examples (optional)
    config.json
```

### Skill Template

```markdown
---
name: skill-name
description: Brief description for when to use this skill
tags: [pikku, tag1, tag2]
---

# Skill Title

Brief introduction to what this skill covers.

## When to use this skill

Bullet points of use cases.

## Core Concepts

Explanation of key concepts.

## Setup / Installation

Dependencies and setup steps.

## Basic Usage

Step-by-step guide with code examples.

## Advanced Patterns

More complex use cases.

## Examples

Complete working examples.

## Review Checklist

- [ ] Verification items
```

### Priority Order

**Week 1-2: High Priority**

1. pikku-express
2. pikku-fastify
3. pikku-next
4. pikku-aws-lambda
5. pikku-cloudflare
6. pikku-kysely
7. pikku-jose
8. pikku-queue-bullmq
9. pikku-testing
10. Update existing skills (cli, http, channel, queue)

**Week 3: Medium Priority** 11. pikku-uws 12. pikku-azure-functions 13. pikku-queue-pg-boss 14. pikku-pino 15. pikku-project-init 16. pikku-security

**Week 4: Low Priority** 17. pikku-ws 18. pikku-aws-services 19. pikku-monitoring

---

## Success Criteria

- [ ] All 18 new skills created with complete documentation
- [ ] All 4 existing skills updated with new sections
- [ ] Each skill includes working code examples
- [ ] Each skill follows the established template pattern
- [ ] Skills are properly tagged for discoverability
- [ ] Cross-references between related skills are included
- [ ] Review checklists are comprehensive and actionable

---

## Notes

- Skills should focus on **how** to use functionality, not **why** it exists (that's in CLAUDE.md)
- Include realistic, working examples that developers can copy/paste
- Keep skills focused and scoped - better to have many small skills than few large ones
- Reference official package documentation for deep technical details
- Emphasize patterns and best practices, not just API documentation
