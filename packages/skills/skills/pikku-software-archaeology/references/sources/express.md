# Source guide: Express (Node.js)

Read this when the survey finds `express` in `package.json`. Express has no conventions, so every Express app is its own framework. The same product can be one 3,000-line `server.js` or a layered app that imitates Nest. Your job is to find which, then trace the request path by hand. The same approach works for Koa, Fastify and Hono; adjust the registration syntax.

## Detect

`express` in dependencies, `app.listen`, `express.Router()`. Note the module system (CJS vs ESM), TypeScript or not, the ORM or query layer (Prisma, Sequelize, Knex, Mongoose, raw `pg`/`mysql2`), the session/auth approach (Passport, JWT, express-session) and the entry point named in `package.json` `main`/`scripts.start`.

## Where intent hides

Start at the entry file and follow `app.use`. **Order is behavior**: middleware registered before a route applies to it, middleware registered after does not.

| Location                                                                  | Blueprint concept                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| entry file (`app.js`, `server.js`, `index.js`, `src/app.ts`): every `app.use` in order | global middleware chain, raw-body routes, CORS, mounts, architecture constraints |
| `routes/`, `routers/`, `api/`: `router.get/post/...`, `app.route()`       | api surfaces; track the mount prefix (`app.use('/v1/invoices', r)`) |
| auth middleware (`requireAuth`, `isAdmin`, `passport.authenticate`, `jwt.verify`) | authorization policies; note which routes use it and which do not |
| handlers/controllers: inline `if (...) return res.status(4xx)`            | preconditions and policies (every guard is one)                   |
| validation: `joi`, `zod`, `yup`, `express-validator`, `celebrate`, hand-rolled `if (!req.body.x)` | command `input[]` + validation policies          |
| models: Mongoose schemas, Sequelize models, Prisma schema, SQL files, migrations (`knex`, `umzug`), or raw SQL strings | entities, constraints          |
| `services/`, `lib/`, `utils/`, `helpers/`                                 | business logic; the real commands usually live here               |
| `jobs/`, `workers/`, `cron/`, `node-cron`, `agenda`, `bull`/`bullmq`, `setInterval` at module scope | system workflows            |
| webhook routes (`/webhooks/stripe`, signature checks, `express.raw`)      | integration ingress; command + signature policy                   |
| `socket.io` / `ws` setup                                                  | realtime interface                                                |
| `process.env.*`, `config/`, `dotenv`                                      | integrations, toggles, deployment constraints                     |
| `test/`, `__tests__/`, `*.test.js` (supertest/jest/mocha)                 | scenarios; edge cases not in the code                             |

## Idiom -> blueprint -> Pikku

| Express idiom                                         | Blueprint concept                                  | Pikku shortcut                                         |
| ----------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `router.post('/:id/send', auth, handler)`             | command (`SendInvoice`), not "POST /:id/send"      | `pikkuFunc` + `wireHTTP` keeping path for compatibility |
| `router.use(requireAuth)` before a set of routes      | authorization policy `enforcedAt` each route in scope | auth by default; list public routes explicitly      |
| `if (resource.userId !== req.user.id) return 403`     | ownership policy, repeated per handler             | one named permission function, wired everywhere        |
| `req.body` hand-checks / Joi schema                   | `input[]` + validation policy                      | Zod schema                                             |
| `res.status(409)` on duplicate / state conflict       | precondition on entity state                       | guard clause inside the func                           |
| `await sendEmail(...)` at the end of a handler        | **implicit event consumer**                        | emit event, consumer in `wireQueueWorker`              |
| `setTimeout`/`setInterval`/`node-cron` in module scope | system workflow (often undocumented)              | `wireScheduler`                                        |
| `emitter.emit/on` (`EventEmitter`)                    | in-process event (not durable)                     | EventHub / queue; note the lost-on-crash gap           |
| Mongoose/Sequelize hooks (`pre('save')`, `beforeCreate`) | implicit events / validation                    | explicit step in command                               |
| `express.raw()` / `bodyParser.raw` for one route      | deployment constraint (signature verification)     | raw-body config on that `wireHTTP` route               |
| `app.use(express.static)` + SPA fallback              | frontend hosting                                   | separate deploy / TanStack Start                       |
| `res.render` (EJS/Pug/Handlebars)                     | server-rendered frontend (see SKILL.md note)       | TanStack route + `usePikkuQuery`                       |
| `req.session` / `req.user` set by Passport            | session model                                      | Pikku session                                          |

## Traps

- **Public by omission.** The unguarded route is the default. Build a table of every route vs which middleware applies and look for ones that have none; the legacy apps that "have auth" often have three unguarded admin endpoints. Each is a gaps.json security entry.
- **Middleware order bugs.** A route registered before `app.use(auth)` is public even though it sits in the same file. Read order top to bottom, with mounts.
- **`next(err)` and the error handler** define the real error contract (status codes, shapes). Read the final `app.use((err, req, res, next) => ...)` and record the mapping.
- **Business logic in handlers.** If no service layer exists, the handler IS the command: its guards, DB writes, side effects and response form one concept. Name it from the effect.
- **Duplicated handlers.** Copy-pasted routes (`/v1` and `/v2`, or admin and user versions) that drifted. List both, flag the difference as a gap.
- **Hidden writers.** Several routes and a cron job may all write one status column. Grep the column to find every transition, as with Rails.
- **Callbacks and fire-and-forget.** `doThing().catch(console.error)` without `await` means a side effect that can fail silently: an invariant with `enforcedBy: nothing`.
- **Tenancy by hand.** Whether `WHERE tenant_id = req.user.tenantId` appears on every query is the question. Missing on one is a gap.
- **Mongo and loose schemas.** With schemaless data, the entity shape is spread across writers. Reconstruct attributes from schemas, fixtures and serializers, and say which are optional in practice.
- **Env-driven branches** (`if (process.env.NODE_ENV === 'production')`, feature flags): record the flag and the behavior difference.
- **Monolith with many entry points**: `server.js`, `worker.js`, `cron.js`, `scripts/`. Each runnable is a component in `architecture.json`.

## Search checklist

```
grep -rnE "app\.use\(|router\.use\(" .          # middleware + mounts, in file order
grep -rnE "(app|router)\.(get|post|put|patch|delete|all|route)\(" --include=*.{js,ts} .
grep -rnE "status\((401|403|404|409|422)\)" --include=*.{js,ts} .   # guards = policies
grep -rnE "req\.user|req\.session|req\.auth" --include=*.{js,ts} .
grep -rnE "setInterval|setTimeout\(.*[0-9]{4,}|cron\.schedule|new CronJob|agenda\.define|\.process\(" .
grep -rnE "express\.raw|bodyParser\.raw|stripe\.webhooks|constructEvent|createHmac" .
grep -rnE "emit\(|\.on\('" --include=*.{js,ts} .
grep -rnE "process\.env\.[A-Z_]+" -o --include=*.{js,ts} . | sort | uniq -c | sort -rn
```

## Confidence notes

Behavior in a handler plus a supertest scenario is `high`. A rule that only appears in one route of several similar ones is `medium` (decide whether the others should have it, and record the decision needed). Because there is no declarative structure, expect more `medium` than in Nest, and prefer a short `decisionsNeeded` list over guessing.
