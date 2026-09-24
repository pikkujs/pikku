# An app on top of an OpenAPI spec

The spec becomes an addon first — the `pikku-addon` skill's
`references/openapi.md` covers generating, verifying and checking it against
the real API. This reference is the decision that shapes the app around it:
**whose credentials reach the upstream**, and what the person signs in with.

## Pick the auth mode

| The upstream…                                                            | Mode              | Command                       | Who signs in, and how                                   |
| ------------------------------------------------------------------------ | ----------------- | ----------------------------- | ------------------------------------------------------- |
| Is where the users already have accounts, and has a login endpoint      | Delegated         | `--auth-config <file>`        | Users sign in with their upstream login; no new account |
| Takes a per-user API key, bearer token or basic auth                     | Per-user key      | (the default)                 | App account, then a Connect screen for the key          |
| Uses OAuth2                                                              | Per-user OAuth    | (the default)                 | App account, then Connect via the OAuth consent         |
| Is used on everyone's behalf with one key the business owns              | Shared secret     | `--auth shared`               | App account only; the key is a secret                   |
| Takes no auth                                                            | None              | `--auth none`                 | App account only                                        |

Per-user is the default because the upstream then enforces each person's own
permissions. A shared secret acts with one identity for everyone, so the
install exposes only its reads; widen that deliberately, never by default.

The mode comes from the spec's `securitySchemes` unless a flag overrides it.
Many real specs describe auth only in prose. The generator then refuses rather
than guessing. Read the API's docs and pass the flag that is true.

**Delegated is the right call whenever the upstream is the system of record for
who the users are** — an ERP, a CRM, a helpdesk the whole team already logs in
to. The app then has no separate sign-up, the upstream token is stored per user
at sign-in, and every call acts as that user.

## The auth-config file

JSON, passed with `--auth-config`. Every field is optional except where noted.

```json
{
  "headerName": "DOLAPIKEY",
  "headerFormat": "raw",
  "extraHeaders": { "Origin": "https://tenant.example.com" },
  "delegated": {
    "loginPath": "/login",
    "loginMethod": "post",
    "credentials": ["login", "password"],
    "fields": { "login": "login", "password": "password" },
    "encoding": "json",
    "tokenPath": "success.token",
    "expiresAtPath": "success.expires",
    "identity": { "path": "/users/info", "method": "get" },
    "claims": {
      "source": "identity",
      "externalId": "id",
      "email": "email",
      "name": ["firstname", "lastname"],
      "role": "admin",
      "tenantId": "entity"
    },
    "emailTemplate": "{login}@{host}",
    "roles": { "1": "dolibarr-admin" }
  }
}
```

Top level — how every call authenticates:

| Field          | Meaning                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `headerName`   | The header the API reads the token or key from. Setting it alone means a per-user API key            |
| `headerFormat` | `raw` sends the bare value, `bearer` prefixes `Bearer `. Default: bearer for `Authorization`, else raw |
| `extraHeaders` | Static headers on every request, login included — for upstreams that route on a header               |
| `delegated`    | Present when users sign in with their upstream login                                                 |

`delegated`:

| Field            | Meaning                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `loginPath`      | Required. The spec-relative login operation                                                               |
| `loginMethod`    | Default `post`                                                                                            |
| `credentials`    | What the sign-in form collects: `login` (a username or email), `email`, `password`, `apiKey`. Default `["email","password"]` |
| `fields`         | The upstream's name for each credential, e.g. `{ "login": "username" }`                                  |
| `encoding`       | `json`, `form` or `query` — how the login fields travel. Default `json`                                   |
| `apiKeyHeader`   | The header an `apiKey` credential is sent in. Default `x-api-key`                                         |
| `tokenPath`      | Required. Dot-path to the token in the login response                                                     |
| `expiresAtPath`  | Dot-path to an epoch-seconds expiry. Defaults to the JWT's `exp` when claims come from the JWT            |
| `identity`       | An operation that returns the signed-in user, called with the new token — for logins that return only a token |
| `claims.source`  | `jwt`, `response` or `identity`. Default `identity` when `identity` is set, else `response`               |
| `claims.*`       | Dot-paths to `externalId`, `email`, `name` (one path or several joined with a space), `role`, `tenantId`  |
| `emailTemplate`  | Builds an email for an upstream user who has none: `{login}`, `{externalId}`, `{host}`. Such an address never claims an existing user |
| `roles`          | Maps the raw `claims.role` value onto an app role; an unmapped value gets no role                          |

Check it before building on it: start `pikku dev`, sign in once with
`POST /api/auth/sign-in/delegated` as a real upstream user, and call an exposed
operation with the session. A wrong password must be refused. Keep real
credentials in the environment, never in the config or a test.

What the install wires for delegated mode — `pikkuDelegatedAuth` in
`src/auth.ts`, the token stored per user, actors carrying it into scenarios — is
in the `pikku-auth` skill's `references/better-auth.md`.

## The screens

**If the app has a UI, build the sign-in or connect screen that matches the chosen auth mode (Sign in with <X> for delegated, a Connect <X> screen for per-user keys/OAuth, nothing for a shared secret), labelling fields in the upstream's terms (e.g. 'Dolibarr login', not 'Email').**

- **Delegated** — the sign-in page posts to `POST /api/auth/sign-in/delegated`
  with the fields named in `credentials` (`login` or `username`, `password`).
  It replaces email sign-up; there is no "create account".
- **Per-user key or OAuth** — a Connect screen after sign-in, and wherever a
  call fails with `missing_credential`.
- A `credential_rejected` error (`CredentialRejectedError`, 403) means the
  upstream refused the stored token: show the sign-in again (`reauth:
  'sign-in'`) or the Connect screen (`reauth: 'connect'`), not a generic error.

## Scenarios

A persona that signs in through the upstream needs an upstream credential to
act with. The install adds `credentials` to `pikkuActor` in `src/auth.ts`, and
at sign-in each actor stores `ACTOR_CREDENTIAL_<PERSONA>_<NAME>` from the
environment (e.g. `ACTOR_CREDENTIAL_SALES_REP_DOLIBARR`). Without it every
scenario step that reaches the upstream fails with `missing_credential`. The
`pikku-scenario` skill's `references/personas.md` has the details.
