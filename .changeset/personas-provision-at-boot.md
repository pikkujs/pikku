---
'@pikku/cli': patch
'@pikku/better-auth': patch
---

Personas are provisioned by the deployment, not by the CLI

Signing a persona in was what created their account: the actor endpoint upserted
an `actor: true` row on first sign-in and nothing else did. That is now the wrong
way round — creating an actor row is a power the endpoint only has under
`pikku dev`, so a stage whose sign-in is shut could not be provisioned at all,
and one whose sign-in is open would have had to accept identity minting as the
price of running scenarios.

The obvious fix was to have `pikku persona sync <environment>` write the rows
itself, and that fix is wrong in a way worth naming: the CLI has no connection to
a deployed environment's database. It resolves one from the local project config,
so `pikku persona sync staging` would read staging's API and write whatever
database the checkout happens to point at — right for a developer's own stage,
silently wrong everywhere else.

So provisioning happens where the database already is. `@pikku/better-auth`
exports `provisionPersonas`, which an app calls from its server lifecycle:

```ts
import { provisionPersonas } from '@pikku/better-auth'
import { personaConfigs, personaEnvironments } from '#pikku/pikku-personas.gen.js'

await provisionPersonas(singletonServices, {
  personas: personaConfigs,
  environments: personaEnvironments,
})
```

It creates each missing account through better-auth's own adapter, applies the
roles the persona declares, and is additive — it never revokes. A deploy carries
its personas with it, and no credential has to travel to reach a database.

Two properties carry over, and one is new:

- **A real user's address is refused**, rather than being granted the persona's
  roles. If a row exists for that address without `actor`, provisioning stops and
  names the persona, because the alternative is silently handing somebody else's
  account an `admin` grant.
- **The environment rule still decides who is provisioned.** The same
  `personaEnvironmentRefusal` that decides who may *run* against an environment
  decides who gets an account in it — two rules would drift, and the one that
  drifted would leave an account standing in production for a persona the engine
  then refuses to sign in. The generated personas file now carries
  `personaEnvironments` so the rule can be applied inside the bundle; only the
  `production` flag is projected into it, because an environment's `apiUrl` and
  paths belong to the machine running `pikku scenario`.
- **`pikku persona sync <environment>` now reports rather than writes.** It
  prints who the environment will provision, with which roles, and why anyone was
  skipped — which is what tells you *before* a deploy whether the accounts you
  expect will appear. It needs no `SCENARIO_ACTOR_SECRET` and no database.
