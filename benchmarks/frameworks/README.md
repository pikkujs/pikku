# Framework comparison harness

Measures what Pikku adds on top of the runtime it runs on. Adapters today, all on the same Bun: `pikku` (the standalone deploy output, a compiled Bun executable, at telemetry LE by default, L0 with `PIKKU_TELEMETRY=0`, L3 with `PIKKU_OTLP_ENDPOINT` at the loopback sink), `raw-bun` (a plain `Bun.serve` fetch handler with a Map lookup, no framework, no router library) and `elysia` (written to Elysia's docs, plus `elysia-otel` with the official `@elysia/opentelemetry` 1.4.12 plugin exporting OTLP/proto to the same sink; no hand-written spans).

## Run

```
bun run benchmark:frameworks            # build, conformance gate, matrix (N = 1 and 30), table + results.json
bun run benchmark:frameworks -- --conformance-only
bun run benchmark:frameworks -- profile   # bun --cpu-prof of each server under load, then:
npx tsx benchmarks/frameworks/profile-report.ts <printed .cpuprofile paths>
```

Before measuring, the runner records what each telemetry variant (`pikku-L3`, `elysia-otel`) sends to a decoding sink: spans, log records, bytes per request and metric points, with span names. Results land in `results.json`.

```

```

Flags: `--routes 1,40 --runs 5 --warmup 4 --duration 8 --connections 16 --rate auto|<req/s> --only pikku,raw-bun --out file`.

## What every request does, in every adapter

cookie -> better-auth `getSession` (reads the session row from SQLite; `cookieCache` is off) -> permission check (a plain function on the user's `permissions` column: Pikku `pikkuAuth` guard, raw a function call) -> validate the JSON body (`@cfworker/json-schema`, same JSON Schema derived from one zod schema) -> one SQLite read -> JSON `{ route, id, name, value }`.

## Held equal

- better-auth 1.7.5, one shared options module (`shared/auth-options.ts`), same secret; `rateLimit` off, logging off.
- Same SQLite driver and query: `node:sqlite` through `@pikku/addon-kysely-node-sqlite`, `shared/db.ts`. Each cell gets its own copy of one pristine database file.
- Same validation library and schema; same response shape; no logging (Pikku console output silenced, handlers log nothing); no compression; keep-alive; one process, no cluster; both compiled with `bun build --compile`.
- The login happens once in setup (`shared/seed.ts`, outside every measured window, so password hashing is never measured); the session cookie is sent on every request.
- One route table (`shared/routes.ts`): N routes `POST /api/items/r<i>`, permission `p<i mod 4>`; the same fixed request plan, round-robin, for every server. N = 1 and 30. Pikku routes are generated source (`pikku/gen-routes.ts`), one binary per N; raw-bun builds its Map from the same table at start.
- Fresh process per cell, cells interleaved in shuffled rounds, warmup, several runs, median reported. Fixed rate = 50% of the slowest cell's saturated req/s. CPU is the server process's `ps` cputime (all threads) over the window.

## Known differences and approximations

- Invalid input answers 422 in Pikku (its validation status); the raw app returns 422 too. The conformance gate checks 200 (same body, first and last route), 401 without cookie, 403 without the permission, 422 on bad input, and 401 after the session row is deleted from the database (proves the DB read).
- Pikku runs its own coercion pass, scopes resolution and context creation; the raw app has none of these. That is the difference being measured.
- Both cfworker validators compile the schema once at start.
- Elysia validates with its native TypeBox schema (a different validator, kept on purpose), and runs validation before its session macro; the conformance statuses are the same. Elysia's OpenTelemetry plugin also auto-instruments better-auth's DB calls, so it emits more spans per request than Pikku.
- Cold start is time from spawn to the first authenticated 200 and is noisy on a busy machine.
- Express was dropped from this comparison; a folder `express/` with an adapter can be added later.

## Adding a framework

Create `benchmarks/frameworks/<name>/adapter.ts` default-exporting an `Adapter` (see `types.ts`): `name`, `runtime`, `variants` (id + env) and `prepare(routes)` returning the command to start. The runner provides `PORT`, `HOST`, `BENCH_DB`, `BETTER_AUTH_SECRET`, `BENCH_ROUTES`, and stops the process with SIGTERM. It must answer the conformance cases; if it does not, the runner refuses to measure.
