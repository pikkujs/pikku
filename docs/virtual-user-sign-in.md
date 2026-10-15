# Virtual user sign-in

How a virtual user gets a session. This replaces three older paths (a derived
secret per virtual user, a Fabric operator token with impersonation, and a
sign-in hook the app wires) with one door and two ways to reach it.

Status of each statement: facts read from the code are stated plainly; anything
not checked is under "Not verified".

## One door

The app's virtual-user sign-in handler (the `signIn` closure in
`packages/services/better-auth/src/virtual-user-plugin.ts`) is the only thing
that creates a virtual user session. It refuses real users (rows without
`virtualUser: true`), creates a row only when `mayProvision` is true (that is
`pikku dev` alone), and sets the session cookie. Every route below ends in it.

## The two ways in

### Runs: in-process

A run (started by a person through `runVirtualUser`, or by the scheduled tick
running as `pikku-platform` with only `virtualUser:run`) already executes inside
the app. It does not need to prove anything to itself, so it asks for the
session directly:

- A better-auth endpoint `signInVirtualUserInternal` is marked
  `metadata: { SERVER_ONLY: true }`. better-call leaves such endpoints out of
  the router, so `auth.handler` returns 404 for the path while `auth.api` can
  still call it. It takes `{ email, name }`, needs no secret and consults no
  environment gate, and runs the same `signIn` closure.
- The seam is `services.auth`, which core already declares as a structural
  `AuthInstance` (`api: Record<string, any>`). The generated
  `executeVirtualUserRun` destructures `auth` and hands it to core. No new
  service, no registration hook, no app edit. A project without better-auth has
  no `auth`, and the run fails with a message that says so.
- The call is made with `asResponse: true`; the `Set-Cookie` values go into the
  existing cookie jar. The run then drives the app over HTTP with that cookie.
  better-auth's bearer plugin is not added.
- The run calls the app at its public URL, read from the variable
  `VIRTUAL_USER_API_URL`. `pikku dev` sets it to the dev server's URL once the
  port is bound. On a deployed stage it is an ordinary variable the deployer
  sets; when it is missing the run fails with a message that names the variable
  and says what to put in it.

### External callers: one signed statement

The dev switcher, `pikku scenario run`, `pikku virtual-user run`,
`pikku virtual-user rpc`, `pikku pages screenshot --as` and the Playwright
provider are outside the app. They present one signed statement:

- An EdDSA (Ed25519) JWT with `sub` = virtual user id, `aud` = the app's
  audience, `exp` a few minutes out (default 3, hard ceiling 5), `iat`, and
  `jti` = a one-time id.
- The app verifies it with a verify-only service,
  `JoseVirtualUserStatementVerifier` in `@pikku/jose` (`importSPKI` +
  `jwtVerify`, `algorithms: ['EdDSA']`), against a PUBLIC key. The app never
  holds a private key.
- `POST /sign-in/virtual-user` takes `{ statement }`, verifies it, maps `sub` to
  the declared virtual user and signs it in (cookie in the response).
- The id-only switcher (`POST /sign-in/switch-virtual-user { id }`) keeps working
  under `pikku dev`. Anywhere else it also needs `statement`, which must name the
  same id. There is no credential-free path on a stage.

## Key material and who holds each private key

| Environment | Private key | Public key reaches the app as |
| --- | --- | --- |
| `pikku dev` | Generated on first start, written to `<runtimeDir>/virtual-user/signing.key` (mode 0600, with a `.gitignore` of `*` beside it). The CLI commands read it from there. | `process.env.VIRTUAL_USER_VERIFY_KEY`, set by `pikku dev` before services are built. |
| Fabric stage | One key pair per stage, held by Fabric's backend. | The variable `VIRTUAL_USER_VERIFY_KEY`, set per stage by Fabric. |
| Plain open source deploy | One key pair per stage, held by the deployer's machine (`VIRTUAL_USER_SIGNING_KEY` in the environment of whoever runs the CLI). | The variable `VIRTUAL_USER_VERIFY_KEY`, set by the deployer. |

Neither name starts with `PIKKU_` or `FABRIC_`. The app reads the public key
with `variables.get('VIRTUAL_USER_VERIFY_KEY')`. The value is the SPKI DER of the
key, base64 on one line (a PEM is also accepted). Users never see or manage
keys: `pikku dev` makes them, a deploy supplies them.

A stage that has no `VIRTUAL_USER_VERIFY_KEY` registers no statement endpoint.
The CLI's error for that case says the stage has no verify key and which
variable to set.

## Statement format and the replay rule

```
header  { alg: "EdDSA", typ: "JWT" }
claims  { sub: <virtual user id>, aud: <audience>, iat, exp, jti: <uuid> }
```

The verifier rejects a wrong algorithm (including `none` and HS256), a wrong
key, a wrong audience, an expired statement, a lifetime beyond the ceiling, a
missing `sub`/`jti`, and a `jti` it has already accepted.

Replay store: an in-memory map of `jti` to expiry inside the verifier,
purged on every call, so it never grows past the statements issued in the last
few minutes. It is per process. See "Not verified" for what that means on a
multi-instance or Worker deployment.

Audience: the origin of the app's auth base URL (better-auth's `baseURL`). The
signer uses the origin of the URL it calls. The plugin option `audience`
overrides it for an app behind a proxy that rewrites the origin.

## Production

Virtual users never run in production (the disposition and environment checks
shipped earlier in this PR stay). In addition:

- The plugin registers the statement endpoint, the in-process endpoint and the
  switcher only when the gate is open at construction (`pikku dev`, or the
  explicit stage opt-in). In production none of them exists, so there is no
  route to refuse and no handler to reach through `auth.api`. This replaces
  "always registered, refused at request time".
- Creating a row stays `pikku dev` only. A stage signs in only to virtual users
  provisioned at startup.

## What is deleted

- `operatorToken` on `RunVirtualUserInput`, the dispatch payload and the
  scaffold, with the tests that insisted it is not recorded.
- `OperatorSignIn`, `establishOperatorSession`, `VirtualUserSecretSignIn`, the
  operator branches in `HttpVirtualUser`, the CLI resolver and the Playwright
  provider.
- The HMAC-derived per-user secrets (`virtual-user-secret.ts`), the root secret
  `SCENARIO_VIRTUAL_USER_SECRET` and its generated `defineSecret`, the
  `secret` plugin option, `PIKKU_VIRTUAL_USER_SECRETS`,
  `pikku virtual-user secret`, and the dev secret minting.
- `SCENARIO_SIGN_IN_PATH` for runs and the in-app scenario service (the
  in-process route needs no sign-in path). `SCENARIO_RPC_PATH` stays: it names
  where the app serves RPCs, which a run still calls over HTTP.
- This PR's own `wireVirtualUserSignIn` hook: the pikku-state key, the
  inspector detection (`add-virtual-user-sign-in.ts`, `signInFiles`), the
  generated bootstrap import, `loadWiredVirtualUserSignIn` and the
  public-surface entries.

Kept: the production refusal, the cookie jar in core, `verifiers/virtual-users`.
No deprecated aliases; this is a hard cut.

## What Fabric must build (outside this repo)

1. Generate one Ed25519 key pair per stage at stage creation. Keep the private
   key in Fabric's backend; never put it on the stage.
2. Set the stage variable `VIRTUAL_USER_VERIFY_KEY` to the public key (SPKI DER,
   base64). The name is not reserved; Fabric must accept it on a stage.
3. Set `VIRTUAL_USER_API_URL` on every stage that runs virtual users, to the
   stage's public URL including any HTTP prefix.
4. Replace the operator sign-in route and `FABRIC_OPERATOR_TOKEN` handling: the
   backend signs statements with the stage's private key for callers that act on
   a stage (the console, `fabric` CLI paths that start a run or take a
   screenshot as a virtual user) and hands the statement to them, or hands the
   key to the CLI through whatever channel it already uses for stage
   credentials, as `VIRTUAL_USER_SIGNING_KEY`.
5. Stop sending `operatorToken` in `runVirtualUser` requests; the field no longer
   exists and the schema rejects unknown input only if the app's validator is
   strict, so remove it explicitly.
6. For the stage switcher: sign a statement for the chosen virtual user and pass
   it to `/sign-in/switch-virtual-user` as `statement`.

## Decisions taken

- Cookie, not bearer. The jar already exists and apps do not register
  better-auth's bearer plugin; the in-process sign-in returns the cookie.
- Public URL, not a service binding. The run is a queue worker unit and the
  existing bindings carry RPC, not HTTP. A public URL variable works the same on
  a dev machine, a node box and a Worker.
- `services.auth` is the seam: smallest, and it already exists, typed
  structurally so core does not import better-auth.
- The switcher works on stages only behind a statement.
- One key pair per stage, so a statement for one stage verifies nowhere else.
- Ed25519 with `node:crypto` for signing in the CLI (no new dependency); `jose`
  for verifying in the app (already a dependency of `@pikku/better-auth`).
- The statement endpoint needs the declared virtual users (id to address), so it
  is registered only when the app passes `virtualUserSignIn.virtualUsers`, which
  the generated `virtualUserList` provides.

## Not verified

- That Fabric accepts an arbitrary non-reserved variable name per stage, and
  rejects `PIKKU_`/`FABRIC_` names. The Fabric repo is not on this machine; this
  comes from the brief.
- Replay protection across instances. The store is per process, so on a
  multi-instance deployment or Cloudflare Workers (separate isolates) a
  statement can be replayed once per instance within its few-minute life. A
  shared store (the better-auth `verification` table) would close it; not built.
- Whether a Worker can `fetch` its own public hostname. The run needs this for
  `VIRTUAL_USER_API_URL` on Workers. No code in the repo does a self-fetch there.
- The audience check behind a proxy that rewrites the origin. The `audience`
  option exists for it; not exercised.
- Reading roles back through `get-session` for a run: without
  `SCENARIO_SIGN_IN_PATH` a run reads roles through the `getMyScopes` RPC and
  falls back to `/auth/get-session`.
