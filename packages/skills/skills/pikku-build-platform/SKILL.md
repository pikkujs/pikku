---
name: pikku-build-platform
description: >-
  Build an app that exercises every Pikku surface — workflows, schedules, queues, an AI agent,
  realtime, MCP, multiple locales, contract versioning and scenario coverage — on top of the full
  pikku-build-app workflow. For proving what the platform does, not for shipping the smallest
  thing that works. TRIGGER when: the user picked "Platform", asked for a showcase or reference
  app, or asked to demonstrate what Pikku can do. DO NOT TRIGGER when: the user wants a product
  built (use pikku-build-app), something quick (use pikku-build-quick), or one specific surface
  wired into an existing app — a single workflow, cron job or agent (use that surface's own skill,
  e.g. pikku-workflow, pikku-wiring, pikku-agent).
---

# Build a platform showcase on Pikku

**This skill is a delta. `pikku-build-app` is the base — read it and follow it in
full.** Everything there applies: knowledge base first, personas and roles,
milestones planned then built one at a time, scenarios, design pass, deploy
gates, Fabric-readiness. This file adds the surfaces that turn an app into a
demonstration of the platform, and says where each one slots into that workflow.

Read `pikku-build-app` now, then come back. Do not blend the two into one plan —
the phases below hang off its phases by number.

## What "platform" means here

Breadth is the deliverable. A showcase that does one thing beautifully has
failed; a showcase where every surface is a stub has also failed. The bar for
each surface below: **it does something the app genuinely needs, and a scenario
proves it.** A cron job that logs "tick" is not a schedule — it is a comment.

Budget the extra surfaces at one milestone each. They are not free, and a
half-wired workflow engine is worse than no workflow engine.

## Choosing surfaces — during `pikku-build-app` §5 (planning)

When you plan milestones, each surface below becomes its own milestone note in
`knowledge/milestones/`, ordered after the spine it depends on.

**Five are required, and if the domain does not motivate them you chose the
wrong domain:** workflows, schedules, queues, an AI agent, and realtime. They are
what "platform" means here, and a showcase missing one of them is a showcase of
something else. Pick a domain that needs all five — that choice is yours to make
at §1, and it is much cheaper than contriving a use later.

The rest — MCP, triggers and webhooks, extra locales, contract versioning,
addons — are chosen on merit. Write the motivation into the note. If you cannot
name what one of *those* is for in this app, drop it and say why in
`knowledge/decisions/`: a documented omission is a stronger showcase than a
contrived inclusion.

What is never acceptable is a required surface present as a stub. A cron job
that logs `tick` does not become a schedule by existing, and it is worse than
the documented omission because it claims to be finished.

Most surfaces are switched on by the CLI rather than hand-wired:

```sh
bunx --bun pikku enable workflow      # workflow workers
bunx --bun pikku enable agent         # public agent endpoints
bunx --bun pikku enable events        # realtime events channel + SSE stream
bunx --bun pikku enable remote-rpc    # internal RPC queue worker + HTTP endpoint
bunx --bun pikku enable webhook       # outgoing webhook delivery queue worker
bunx --bun pikku enable scenarios     # scenario instrumentation
bunx --bun pikku enable console       # console functions
bunx --bun pikku enable rpc           # public RPC endpoint
```

Each scaffolds a `*.gen.ts` and wires it. Run the enable, then `pikku all`, then
write the function — not the other way round.

## The surfaces

Each has an installed skill that is authoritative on its API. Read it before
writing the wiring; this section says what the surface is *for* and how to prove
it, not how to call it.

### Workflows — `pikku-workflow`

The one that most changes how an app is built. A workflow is a durable,
resumable, multi-step process — approval chains, onboarding, anything that waits
on a human or a timer and must survive a restart.

- **Motivation test:** is there a process here with more than one step and a
  gap in the middle? If every operation completes in one request, you do not need
  workflows and forcing one is noise.
- **Prove it:** a scenario that starts the workflow, advances it as a second
  persona, and asserts the end state. `pikku-react` covers driving it
  from the UI.
- Three workflows ship with the template. Read them before writing yours.

### Schedules — `pikku-wiring`

Recurring work: a nightly rollup, a reminder sweep, an expiry pass.

- **Motivation test:** something in the domain becomes true with the passage of
  time rather than a user action. Rent falls due. A trial ends. A report is
  monthly.
- **Prove it:** invoke the scheduled function directly in a scenario and assert
  its effect. Do not test by waiting.

### Queues — `pikku-wiring`

Work that must happen but not now, and may retry: email fan-out, image
processing, third-party calls that fail.

- **Motivation test:** an operation the user should not wait for, or one that
  fails in ways worth retrying.
- **Prove it:** enqueue in one scenario step, assert the effect in a `then`.

### An AI agent — `pikku-agent`

The template ships agent wiring and `@ai-sdk/openai`. An agent that answers
questions over the app's own data is the showcase; a general chatbot is not.

- **Give it real tools** — your own exposed RPCs, so it answers from the
  database rather than from the model. `pikku all --strict-meta` fails a tool
  with no description, which is the quality gate here: an undescribed tool is
  offered to the model under its bare name and it will misuse it.
- **Gate it.** `getAgentThreads` ships exposed and sessionless — PKU574 flags it.
  Deciding who may reach the agent is part of building it.
- **Prove it** with a scenario that asks something only the database knows.
- Needs a model key. Read it through the injected `secrets` service with a
  matching `defineSecret`, never `process.env`, or deploy has nothing to
  provision (PKU951).

### Realtime and events — `pikku-wiring`

`pikku enable events` gives a realtime channel plus an SSE stream, and the
generated typed client.

- **Motivation test:** two people looking at the same thing at the same time, or
  a long operation whose progress matters.
- **Prove it:** a browser scenario is the only honest proof — assert the second
  persona's screen changed without a reload.

### MCP — `pikku-wiring`

Exposes functions as Model Context Protocol tools, so an outside agent can drive
the app. Cheap once functions exist, and a genuine differentiator to show.

### Triggers and webhooks — `pikku-wiring`, `pikku enable webhook`

Inbound triggers and outgoing webhook delivery. This is where `wireHTTP` is
correct rather than a smell: a third-party caller needs a real REST shape.

### Locales — `pikku-i18n`

`pikku-build-app` already requires every string to be a key. **Here, ship three
locales, and make one of them RTL** (`pikku-i18n`). Two LTR locales prove the
plumbing; an RTL one proves the layout, and it will find real bugs — mirrored
icons, hardcoded `marginLeft`, a nav that opens on the wrong side.

Adding a language means adding a locale file. If it means touching components,
that is the finding.

`baseLocale` stays `en` through all of this — it names the message source that
every added locale is cloned from, so three locales is `locales: ["en", …]` and
never a repointed base. Shipping locales is also not a reason for anything in
the code to stop being English: identifiers are English in every project, and
the language of `description`/`title`/`template` is `metaLocale` in
`pikku.config.json`. See `pikku-build-app` §1a.

### Emails — `pikku-emails`

Templates in `emails/`, rendered and sent through the injected `email` service,
localised like every other string. The base workflow asks for one; **a showcase
sends three** — a welcome, a transactional confirmation, and one sent from a
schedule or queue rather than a request, because that is the interesting path.

### Contract versioning — `pikku-versioning`

```sh
bunx --bun pikku versions init
```

The CLI suggests this on every run of a project without it. Versioning a function
contract, then changing it, is a short milestone that shows something no
scaffold demonstrates on its own. `pikku semver` derives the release version by
comparing this build's surface against a deployed one.

### Addons — `pikku-addon`

`pikku new addon` scaffolds a publishable addon package. Worth one milestone if
the domain has a piece that genuinely belongs to no single app.

## Coverage — where the bar is higher than the base workflow

`pikku-build-app` §7a already has the mechanics and the per-milestone habit:
run the server instrumented, run the scenarios against it, read
`coverage/scenario-coverage.json`, and triage every gap as a missing scenario, a
function that should not exist, or a documented deferral. Do all of that here.

Two things change in a showcase:

- **Every surface you enabled has to appear in the coverage, not just every
  function.** A workflow, a schedule, a queue worker and an agent each run on
  their own path; a green scenario suite that never advances the workflow past
  step one is the difference between "the platform does workflows" and "there is
  a workflow file in this repo". Check the surfaces by name, because a coverage
  percentage in the nineties hides an entire unexercised surface comfortably.
- **The number is part of the deliverable.** A showcase is read as evidence, so
  publish the figure alongside it. An unreported number invites the reader to
  assume the worst, and in a demo repo they are usually right to.

## The full gate

Everything in `pikku-build-app` §9, plus the checks a showcase should be able to
survive:

```sh
bunx --bun pikku all --tsc-summary --fail-on-warn --strict-meta
bunx --bun pikku all --security --fail-on-error
bunx --bun pikku validate
bunx --bun pikku knowledge validate
bunx --bun pikku audit
bunx --bun pikku scenario run local --spawn --coverage
bunx --bun pikku scenario run local --spawn --run browser
```

- `--strict-meta` fails an agent tool with no description.
- `--security` runs the data-classification lint over function return types,
  catching a `Pii`/`Secret` field leaking through an exposed function. Expensive;
  worth it here.
- `pikku audit` reports dependency advisories (`--outdated` adds available
  updates) into `.pikku/audit.json`.

## Deploy

`pikku-build-app` §9 covers the open-source paths (`--provider standalone`,
`cloudflare`, `aws`). One thing specific to this mode: **the extra surfaces are
extra deploy units.** Workflow workers, queue workers, schedules and the events
channel each appear in `pikku deploy plan` as their own entries. Read the plan
before applying — that list is also the clearest inventory of what you actually
built.

## Reference

- Base workflow: `pikku-build-app` — read it first, follow it in full
- Per-surface skills: `pikku-workflow`, `pikku-wiring`, `pikku-agent`,
  `pikku-i18n`, `pikku-emails`,
  `pikku-versioning`, `pikku-addon`, `pikku-auth`, `pikku-services`
- Every feature, end to end: https://pikkufabric.com/llm-all-features.txt
