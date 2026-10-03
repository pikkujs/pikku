# Pikku — build and deploy a full-stack TypeScript app

You are an AI agent. This file gets you to a scaffolded project with the right
build skill loaded, and then gets out of the way. It is short on purpose:
everything about *how* to build lives in three skills that ship with the CLI.

Follow it in order. Do not improvise the setup — every step exists because
skipping it fails later.

---

## 0. Start from the request

**Your first reply opens with one question: how technical is the person?**

> Before I start: are you a developer, technical but you'd rather not see code,
> or not technical? It changes how I talk you through this, not what I build.

Their answer sets how you talk for the whole build, and it goes into every
later step, the skills included:

| | **Not technical** | **Technical, no code** | **Developer** (default if unanswered) |
|---|---|---|---|
| Code in the conversation | never | never | as normal |
| Console links | product only | all | all |
| Words | theirs: screens, people, what someone can do | plain, technical terms allowed | as normal |

*Product links* are what the app does, seen from the outside: personas, roles and
permissions, scenarios and their runs, workflows, agents, knowledge. *Technical
links* are how it is built: functions, wires, HTTP routes, the database, config,
secrets. Whenever you make or change something the Pikku Console can show, link
it rather than describing it. Until the app is deployed that is the local
open-source console, `http://localhost:3000/console/...` (the port `bun run dev`
printed). Once it is on Fabric, link the Fabric console for the stage you are
talking about instead; the `pikku-fabric` skill says which. Use `?id=<name>`
where the page takes one, e.g. `/console/workflow?id=<workflow>`.
When the person isn't a developer, a link is how you show your work. Code never
is.

Carry on with the defaults below while they answer; nothing here waits for it.

The request that brought you here already says what the app is. Take it as
stated, take **App** as the shape, assume no files, English, and start. Say in
one line which defaults you took. Do not open with a questionnaire; the person
typed one line on purpose.

Ask only if the request names no app at all, and then ask one question: **what
is the app?** One or two sentences is enough.

**One thing you do ask up front: how many apps.** Put it in your first reply,
one line, alongside the defaults you took:

> Is this one app for everyone who signs in, or do different groups get their
> own way in? Name them if so.

**One app is the default** and the right answer for most requests. People who
work together share an app and differ by what they can see and do — a mechanic,
the person on the counter and the bookkeeper are one app, and a back-office area
is a route (`/admin`), not a second frontend. A second app is for someone on the
other side of the counter who signs in — a customer, a tenant, a patient — and
it exists because they asked for it here, not because you noticed two kinds of
user. No answer means one app: say so and build. `references/multi-app.md` owns
what a second one costs and adds it at the milestone that first needs it.

Two overrides the person can give in that same line, or later:

- **Files** — "read the CSV in ./data", an attached spec, an existing schema.
  If they are mentioned, read them before the scaffold. If not, there are none.
  Two kinds get converted before anything else is built, and you say so in
  your first reply, in the same line as the defaults:
  - **An OpenAPI / Swagger spec** (a top-level `openapi` or `swagger` key) —
    "This is an OpenAPI spec — I'll turn it into an addon first." The whole
    spec, however large, becomes a workspace package in the app.
  - **An n8n export** (`nodes` and `connections`) — "This is an n8n workflow —
    I'll import it first."

  Neither is the app. Scaffold as usual; the `pikku-build` skill in step 3
  does the conversion, then carries on building the app on top of it.
- **Shape** — say "quick" or "platform" and it changes how much gets built:

   | | **Quick** | **App** (default) | **Platform** |
   |---|---|---|---|
   | Knowledge base | — | ✓ | ✓ |
   | Milestones, built one at a time | — | ✓ | ✓ |
   | Personas + roles | minimal | ✓ | ✓ |
   | Scenarios proving each piece | smoke only | ✓ | ✓ |
   | Scenario coverage measured | — | per milestone | per surface |
   | Design direction + critique | — | ✓ | ✓ |
   | Workflows, schedules, queues, agents, realtime | — | — | ✓ |
   | Good for | seeing an idea run | a real product | proving the platform |

   - **Quick** — an app, fast. Skips the knowledge base and the milestone
     ladder. Right for a spike, a demo, or an idea nobody has committed to yet.
     Honest about what it is: not resumable by another agent.
   - **App** — the full workflow, run locally on open-source Pikku. Knowledge
     base first, milestones planned then built one at a time, each proven by a
     scenario and measured for coverage before the next one starts. This is the
     default and the right answer for most requests.
   - **Platform** — everything App does, plus the surfaces that show what Pikku
     is: workflows, schedules, queues, an AI agent, realtime, multiple locales.
     Slow, and the point is breadth.

The skill you load in step 3 asks **one round** of three to five questions — the
ones that change the schema and the screens. That is the only round. If nobody
answers it, take sensible defaults, say which, and build. An unattended agent
must reach a running app on its own.

That same round asks whether to **show them what the app will look like** before
building it, with yes marked as recommended. Ask it in plain words, never as
"mockup" or "wireframe", which most people don't know:

> Before I build, shall I show you a picture of the main screens so you can say
> "yes, like that" or "no, move this"? (Recommended: it takes a few minutes and
> changing a picture is much cheaper than changing a built app.)

It is one page of the main screens, drawn from the app's theme file so what they
approve is what ships. Once they approve it, it is the source of truth for the
screens, and the milestones are read off it. If they say nothing, draw it anyway
and carry on building from it. Skip it only when they say no. When you show it,
say it is a picture and nothing is built yet, and the page carries the same
banner. A good picture reads as a finished app.

Then show the picture and the milestone list together as the plan, and ask for
one approval. After it, build every milestone to the end without stopping to
ask between them. Stop only for what is theirs to decide: a missing credential,
money, a public post, or deleting their data.

---

## 1. Scaffold

    bun create pikku@latest --name <app-name> --template fabric --package-manager bun --skip-install
    cd <app-name>
    bun install

The template is open source and the scaffolder talks to nobody — it downloads a
tree. Nothing before deploy needs an account.

Install is a separate step on purpose: the scaffolder's built-in `--install` can
be intercepted by corepack, which does not support bun, and it fails quietly —
leaving a complete tree with an empty `node_modules`. Run `ls node_modules | head`
and confirm it is not empty before continuing.

(`npm create pikku@latest` works the same if bun is missing.)

You now have: Better Auth sign-in, SQLite/libSQL with migrations, typed RPC
functions, generated React Query hooks, TanStack Start + Tailwind v4 + shadcn/ui with i18n,
transactional emails, seeded dev personas, and scenario tests.

---

## 2. Install the skills

    bunx --bun pikku skills install --core --client --fabric

Under pi add `--agent pi`: the skills land in `.pi/skills/` and the three stage agents in
`.pi/agents/`, so read `.pi/skills/...` wherever this file says `.claude/skills/...`. `--client`
matters: the frontend skills (`pikku-theme`, `pikku-tailwind`, `pikku-i18n`, `pikku-react`,
`pikku-a11y`) are in that group, and `--core --fabric` alone leaves them out.

This writes the Pikku skill corpus into `.claude/skills/` describing how Pikku actually
works: functions, wirings, permissions, database access, i18n, auth, knowledge,
scenarios, deployment. **They are the spec.** Read the ones that touch your task
before editing. If you are guessing at an API, there is a skill for it and you
should read it instead of guessing.

Among them is `pikku-build`, the build skill this file routes to. It is open
source and does not require a Fabric account. It carries one reference per mode:

- `references/quick.md` — an app, fast
- `references/app.md` — the full workflow, locally *(default)*
- `references/platform.md` — everything, to prove the platform

---

## 3. Hand off

Read `.claude/skills/pikku-build/SKILL.md`, then the one reference for the mode
chosen in §0. It assumes exactly what you have now — a scaffolded project with
skills installed — and it owns every decision from here.

**If your harness has subagents, delegate the stages to them.** With pi that is the `subagent` tool from `pi-subagents`, and the agents are in `.pi/agents/`: `pikku-knowledge` writes the knowledge, `pikku-architect` writes each milestone's plan before any code exists, and `pikku-build` builds each pass. You talk to the user, hold the approvals, and dispatch; you do not write the plan or the code yourself.

Do not read all three references. Do not blend them. If the user changes their
mind mid-build, quick → app is a real upgrade path and the skill says how to
take it; the reverse is not.

Two libraries carry their own LLM docs — load them when you touch that layer,
whichever mode you are in:

- **UI — shadcn/ui + Tailwind v4:** https://ui.shadcn.com/llms.txt and
  https://tailwindcss.com/docs. Every screen is shadcn components from
  `src/components/ui/` styled by the app's `theme.css` tokens. Run
  `pikku components show <Name>` for the real variants before inventing one, and
  keep `@shadcn/lint` green. For design direction use the **impeccable** skill;
  its output lands in `theme.css` tokens and component variants, never in
  one-off classes.
- **Routing — TanStack Router:** https://tanstack.com/router/latest/llms.txt. The
  route tree, loaders, search params and `head()` all come from here.
- **Auth — Better Auth:** the installed `pikku-auth` skill is
  authoritative and wins over anything else — this template's auth is wired
  through `@pikku/better-auth` and differs from stock. Use
  https://better-auth.com/llms.txt only for base concepts the skill doesn't
  cover. Never hand-roll auth.

Whenever the dev server comes up, and when you hand over, print the links: the
app (`http://localhost:7104`), the API (`http://localhost:3000`) and the Pikku
Console (`http://localhost:3000/console`), with deep links to what you just built
— `/console/knowledge`, `/console/scenarios`, `/console/personas`,
`/console/functions`. Use the ports `bun run dev` printed, not these, if they
differ.

Also read `AGENTS.md` at the project root before your first screen. It is
written by the template and is authoritative on the fixed routing slots
(`/api`, `/app`, `/`), the single `useNavItems()` navigation source, and the
shipped component kit.

---

## 4. Build report

From the first snag, keep `BUILD-REPORT.md` at the project root. Log every time the
harness got in your way: a Pikku CLI bug, a misleading error, a skill or doc
that was wrong or silent, a template defect, a workaround you had to invent.
One entry each, with what you ran, what happened, and how you got past it.
Never record the user's product, code, data or credentials. This file is about
Pikku, not about their app.

At hand-over, show the user the report and ask whether you may send it to the
Pikku team. Send only on a yes, one finding per call:

    bunx --bun pikku fabric report --kind product --stdin   # a Pikku bug
    bunx --bun pikku fabric report --kind harness --stdin   # a skill or doc that misled

If the report is empty, say so and skip the question.

---

## Reference

- Docs: https://pikku.dev
- Skills (authoritative, installed in §2): `.claude/skills/`
- Deploying to Fabric instead of self-hosting: `pikku-fabric` skill
- Every feature, end to end: https://pikkufabric.com/llm-all-features.txt
