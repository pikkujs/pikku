# Source guide: NestJS

Read this when the survey finds `@nestjs/core` in `package.json` and `nest-cli.json`. NestJS is the closest source to Pikku: modules, controllers, guards and providers map almost one-to-one. The risk is not finding things, it is over-mirroring the structure instead of recovering the product.

## Detect

`nest-cli.json`, `src/main.ts` (`NestFactory.create`), `*.module.ts`. Check the platform adapter (Express or Fastify), transports (`@nestjs/microservices`, GraphQL, WebSockets) and monorepo mode (`apps/`, `libs/`): each app is a component, each lib may be a shared domain.

## Where intent hides

| Location                                                                    | Blueprint concept                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `*.module.ts` (imports/providers/exports)                                   | domain candidates; the dependency graph shows ownership              |
| `*.controller.ts`: `@Get/@Post/...`, `@UseGuards`, `@Roles`, `@HttpCode`    | api surfaces, command/query split, authorization                     |
| `*.service.ts`                                                              | the actual command/query logic (controllers are usually thin)        |
| `dto/*.ts` with `class-validator` (`@IsString`, `@Min`), `class-transformer` | command `input[]` + validation policies                             |
| `*.entity.ts` (TypeORM), `schema.prisma`, `*.schema.ts` (Mongoose), `*.model.ts` (Sequelize/MikroORM) | entities, relations, constraints         |
| `*.guard.ts`, `@Roles()`/`@Public()` decorators, `APP_GUARD` providers      | policies (authorization), including global defaults                  |
| `*.pipe.ts`, global `ValidationPipe` options                                | validation policies (check `whitelist`, `forbidNonWhitelisted`)      |
| `*.interceptor.ts`, `*.filter.ts`, `*.middleware.ts`                        | cross-cutting behavior: audit, caching, error mapping, tenancy       |
| `@nestjs/schedule` (`@Cron`, `@Interval`), `@nestjs/bull`/`bullmq` (`@Processor`, `@Process`) | system workflows, queue consumers                |
| `@nestjs/event-emitter` (`@OnEvent`, `emitter.emit`), `@nestjs/cqrs`        | explicit events and consumers; CQRS gives commands/queries for free  |
| `@nestjs/microservices` (`@MessagePattern`, `@EventPattern`)                | event/command ingress from other services                            |
| `*.gateway.ts` (`@WebSocketGateway`, `@SubscribeMessage`)                   | realtime interface                                                   |
| `*.resolver.ts` (GraphQL)                                                   | queries/commands via `@Query`/`@Mutation`                            |
| `@nestjs/config` + `.env.example`, `config/*.ts`                            | integrations, toggles                                                |
| `*.spec.ts` (unit), `test/*.e2e-spec.ts` (supertest)                        | scenarios; e2e specs are the best source                             |

## Idiom -> blueprint -> Pikku

| NestJS idiom                                         | Blueprint concept                              | Pikku shortcut                                              |
| ---------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `@Controller` method + service method                | one command or query                           | one `pikkuFunc`, wired with `wireHTTP`                      |
| DTO class + `class-validator`                        | `input[]` + validation policy                  | Zod schema                                                  |
| `@UseGuards(AuthGuard, RolesGuard)` / `@Roles`       | authorization policy                           | permission functions / middleware                           |
| `APP_GUARD` global guard + `@Public()` opt-out       | default-deny policy + exceptions list          | auth by default, `auth: false` for the listed routes        |
| `@Injectable` provider                               | service or domain logic                        | class in `services.ts`                                      |
| `@Cron`, `@Interval`, `@Timeout`                     | system workflow with `schedule`                | `wireScheduler`                                             |
| `@Processor` / `@Process`                            | queue consumer                                 | `wireQueueWorker`                                           |
| `emitter.emit('x')` + `@OnEvent('x')`                | explicit event + consumer                      | EventHub topic / queue                                      |
| CQRS `CommandHandler`, `QueryHandler`, `EventsHandler`, sagas | commands, queries, events, workflow  | direct 1:1; sagas become `pikkuWorkflowFunc`                |
| `@Interceptor` (logging/caching/transform)           | cross-cutting concern                          | middleware, only if behavior matters to the product         |
| Exception filter mapping errors to status codes      | error contract of the API                      | keep status/code mapping explicit in the func               |
| Request-scoped provider (`Scope.REQUEST`), `AsyncLocalStorage`, `nestjs-cls` | session / tenant context       | Pikku session / services                                    |
| `@nestjs/swagger` decorators                         | documented contract (check for drift)          | generated from `wireHTTP` + schemas                         |

## Traps

- **Structure is not intent.** Nest makes it easy to produce a service-per-table with CRUD controllers. Do not turn `UsersController.update` into `UpdateUser` unless it is a real business action; look at what the service does (status flips, notifications) and name the command from that.
- **Services calling services.** Cross-module calls (`this.billing.charge`) are the real dependency graph. Derive domains from entity ownership, not from module folders.
- **Guards can be bypassed by omission.** Check every controller for a missing `@UseGuards` when the rest have one, and read `APP_GUARD` registrations to see whether the default is secure. Missing coverage is a gaps.json security entry.
- **Global setup in `main.ts`**: `app.useGlobalPipes`, `useGlobalGuards`, `enableCors`, `setGlobalPrefix`, `enableVersioning`, raw-body config for webhooks. These change every route's behavior and belong in `architecture.json`.
- **Decorators carry semantics.** `@Transform`, `@Exclude`, `@Expose`, `@SerializeOptions` shape responses; `@Exclude` on a password field is an invariant about never exposing it.
- **Dynamic modules** (`forRoot`, `forRootAsync`) hide which features are on. Read the module's config call and the env it reads.
- **ORM hooks** (`@BeforeInsert`, `@AfterUpdate`, TypeORM subscribers, Prisma middleware/extensions) are implicit events like Rails callbacks.
- **Event emitter is in-process.** `@OnEvent` handlers run in the same process and are lost on crash, unlike real queues. Record that delivery guarantee as an invariant (`enforcedBy: nothing`).
- **Hybrid apps** (HTTP + microservice + WebSocket in one `main.ts`): each transport is an `interfaces.json` entry.

## Search checklist

```
grep -rnE "@(Get|Post|Put|Patch|Delete|All)\(" src apps libs
grep -rnE "@UseGuards|@Roles|@Public|APP_GUARD|@SetMetadata" src apps libs
grep -rnE "useGlobal(Pipes|Guards|Interceptors|Filters)|enableCors|setGlobalPrefix|rawBody" src apps
grep -rnE "@(Cron|Interval|Timeout|Process|Processor|OnEvent|EventPattern|MessagePattern|SubscribeMessage)" src apps libs
grep -rnE "@(BeforeInsert|AfterInsert|BeforeUpdate|AfterUpdate|EventSubscriber)|\$use\(" src apps libs
grep -rnE "forRootAsync?\(|ConfigService|process\.env" src apps libs
ls test *.e2e-spec.ts 2>/dev/null
```

## Confidence notes

A DTO validation exercised by an e2e spec is `high`. A guard-based rule with no test is `medium`. Because Nest's structure is declarative, most extraction is `high`; keep `medium`/`low` for logic buried in service methods that mix concerns and for anything decided by dynamic module config.
