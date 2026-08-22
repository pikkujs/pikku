---
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku dev` turns actor quick login on and mints its secret; `pikku serve` never
does

Which command is running is the thing that knows whether "sign in as <persona>"
should work, so the two server commands now say so rather than leaving it to
whatever the environment happens to contain.

`pikku dev` sets `PIKKU_DEV_ACTOR_SIGN_IN` before it loads the project and, if no
actor secret is set, mints a cryptographically random one for the run under both
`SCENARIO_ACTOR_SECRET` and the `VITE_`-prefixed copy the dev frontend can
actually read — only prefixed variables reach `import.meta.env`, and the switcher
runs in the browser. Requiring every contributor to hand-manage a secret for a
server that is trusted with the database anyway bought nothing and cost setup
friction on every machine. An explicitly-set secret always wins: a project
pointing its scenario runs and its dev server at one value has to keep that
value. The minted one lives only in this process's environment, so it is gone
when the server stops and yesterday's cannot sign anything in today. Both cases
are logged, naming where the secret came from — the previous silence is what made
a missing control unanswerable from outside the container. Where the two names
disagree the command says so instead of picking one quietly, because that
disagreement presents as "the switcher signs in nowhere".

`pikku serve` is the production server command and does the opposite: it clears
the marker outright, so an inherited environment cannot switch passwordless
sign-in on behind the operator, and it warns when it had something to clear. What
it deliberately leaves alone is `PIKKU_ALLOW_ACTOR_SIGN_IN` — scenario suites have
to be able to run against a deployed stage, and that opt-in is the supported way
to say so.

`pikku validate`'s fix hint for a project with personas but no actor sign-in no
longer tells people to control the endpoint by withholding the secret, which is
no longer how it is controlled, and the `pikku-better-auth` skill documents the
gate, the two escape hatches, and the two distinct refusals.
