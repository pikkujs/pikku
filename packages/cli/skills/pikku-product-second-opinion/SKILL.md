---
name: pikku-product-second-opinion
description: 'Use when a non-technical owner (founder, PM, operator) wants a plain-language report on an app they hold but did not build — explaining how it works and how it could be better. Reads the .knowledge/ blueprint from pikku-software-archaeology and produces a layered, jargon-free report that credits what works, names what does not (with business impact + effort), and argues an opinionated better design. TRIGGER: "explain how my app works", "what would you do differently", "review my app for a non-technical audience", "I inherited/am stuck with an agency-built app", "is this built well?". DO NOT TRIGGER for: extracting the machine-readable blueprint itself (use pikku-software-archaeology), or an engineer-facing technical code review.'
installGroups: [fabric]
---

# Product Second Opinion

## Overview

Turn an extracted product blueprint into a **report a non-technical owner can act on**. Two jobs, in one voice: (1) explain, in plain language, how the app they're stuck with actually works; (2) give an honest, opinionated second opinion — what's solid, what's holding them back, and how you'd build it better, argued in business outcomes, not architecture.

The reader is a founder/PM/operator, not an engineer. If they finish a section and don't know what it means for their business or what to do about it, the report failed — no matter how correct it is.

**REQUIRED INPUT:** the `.knowledge/` blueprint produced by **pikku-software-archaeology**. If none exists, run that skill first — this one consumes its output (`product.json`, `domains.json`, `workflows.json`, `gaps.json`, `invariants.json`, `migration.json`, and any `parity-*.md`), it does not re-derive facts from the code. When the optional consumer-surface files are present (`interfaces.json`, `frontend.json`, `frontend-routes.json`, `frontend-components.json`), cover them too — see "The frontend and the other ways your app is used" and "Technology choices" below.

## The cardinal rule: translate, don't dump

Every technical concept becomes a business outcome or a plain-language description. Never make the reader learn your vocabulary. If a term is unavoidable, define it in one clause the first time — but prefer describing the *effect* and skipping the term entirely.

| Don't write | Write instead (describe the effect) |
|---|---|
| queue / worker / job | "a background task that runs on its own" |
| workflow | "a multi-step task that resumes where it left off if interrupted" |
| API / endpoint / route | "something the app (or another tool) can ask it to do" |
| webhook | "an automatic message the app sends to another tool when something happens" |
| event | "a signal that something happened, that other parts can react to" |
| cron / scheduler | "a timer that runs something on a schedule" |
| schema / migration | "the shape of your stored data" / "a change to how data is stored" |
| auth / session / token | "how the app knows who you are and what you're allowed to do" |
| refactor / rewire | "reorganizing the inside without changing what it does" |
| cache | "a saved copy kept around for speed" |
| race condition | "two things happening at once and stepping on each other" |
| component | "a reusable piece of the screen (a button, a chart, a table)" |
| route / page | "a screen in the app" |
| design system / component library | "the shared kit of screen pieces that keeps everything looking consistent" |
| SSR / SPA / rendering | "how pages get built and shown" (only mention if it affects speed or SEO) |
| MCP server | "a way for AI assistants to use your app's data and actions directly" |
| SDK | "a ready-made toolkit so other developers can build on your app" |
| CLI | "a way to drive the app by typing commands (for power users / automation)" |
| theme token / design variable | "a single setting (like your brand color) reused everywhere, so you change it once" |
| modal / drawer | "a pop-up box" / "a slide-out panel" |

When in doubt, say what the *user or the business* experiences, not what the machine does.

## Report structure (layered — skim or dive)

Write these three parts in order. A reader can stop after Part 1.

**Part 1 — Executive summary (one page).**
- *What you have*: 2–3 sentences — what the product does and who uses it.
- *The headline*: the 3–5 biggest risks/opportunities, one plain line each.
- *Recommended order*: a table (Fix | Why it matters | Effort | Payoff). This is the part they act on.

**Part 2 — One section per major area** (drive the areas from `domains.json`; skip domains with nothing worth saying). Each section follows this shape (see `example/sample-report.md`):
- *What this does* — the capability in business terms.
- *How it works today* — a plain walkthrough, ideally as a small story ("on a timer, the app re-reads each site, compares…").
- *What's working* — genuine credit. Never skip this; a report that's all criticism gets dismissed.
- *What's holding you back* — each problem MUST carry: **what it means for you** (business impact), **severity** (Minor / Worth fixing / Serious / Urgent), and **effort** (Small / Medium / Large).
- *How I'd do it differently — and why it's worth it* — the opinionated part. Argue the improvement in one of these business outcomes: **more reliable / fewer surprises**, **faster to add features**, **cheaper to run**, **safer / less risk**, **easier to maintain or hand off**. Be explicit whether it's a cheap rewire or an expensive rebuild.

**Part 3 — Appendix (optional).**
- *How confident am I* — where you're certain vs guessing; what you'd verify against real data first.
- *Glossary* — only for any term that slipped through.

## Rewire vs rebuild (say which)

The blueprint's `migration.json` tells you which is which — `mappings[]` is what survives (each with its `recommendation`), `dropped[]` is what goes. The reader needs to know because the cost is 10× different.
- **Rewire** — the valuable machinery exists; you're connecting pieces or turning something on. Cheap, low-risk. (Most "it should be automatic but isn't" findings are this.)
- **Rebuild** — the capability doesn't exist or is fundamentally wrong. Expensive, risky. Reserve the word for when it's true; founders hear "rewrite" and panic or overspend.

Never recommend a full rewrite because the code is messy. Messy-but-working is a rewire-over-time story, not a bonfire.

## The frontend and the other ways your app is used

When the blueprint has the consumer-surface files, add these to the report — they're often where a founder's questions actually live ("why does the app feel inconsistent?", "can partners build on this?").

**The screens (`frontend-*.json`) — one area section, founder-framed.**
- *What a user can do* — walk the main screens as a journey, not a component list.
- *Consistency* — is it built from one shared kit of screen pieces, or a patchwork? A consistent kit means changes are cheap and the app feels coherent; a patchwork means every change is bespoke and the look drifts. Say which, plainly.
- *The expensive pieces* — this is the key frontend insight. Most of the screen is standard pieces that are cheap to rebuild or restyle. A **small number carry real custom logic** — a bespoke chart, a complicated data table, a drawing/drag interaction, a rich editor. Those are the parts that take real effort to move or change, and the ones most likely to break. Name them, say what they do, and flag them as the real work — so nobody assumes "it's just screens, it'll be quick."
- *Design consistency (the "it looks a bit off" problems)* — from the blueprint's design findings, call out broken patterns in plain terms and, crucially, why each matters and roughly what it costs to fix. Common ones and how to frame them:
  - **The same action behaves differently in different places** (a slide-out panel here, a pop-up box there for the same task). *Why it matters:* the app feels inconsistent and users have to re-learn each screen. *Fix:* pick one pattern and apply it everywhere — cheap.
  - **Colors/spacing are hardcoded instead of set in one place.** *Why it matters:* changing your brand color, or fixing contrast, means hunting through every screen instead of editing one setting — slow and error-prone. *Fix:* move them to shared "design tokens" — a small, high-leverage cleanup.
  - **The same element looks different from page to page** (buttons, headings, cards). *Why it matters:* reads as unpolished and erodes trust, especially in a paid product. *Fix:* one shared version of each, reused — cheap and makes every future change faster.
  These are almost always **cheap rewires with an outsized polish/trust payoff**, not rebuilds. Give each an effort (usually Small–Medium) and say the payoff is perceived quality + faster future changes. Do NOT design-nitpick without a reason — every design point needs a "why it matters to you." And credit consistency where the app already has it.
- Frame rebuild/restyle work as **rewire vs rebuild**: restyling standard pieces to a consistent kit is cheap; re-creating a custom-logic piece is real engineering.

**How your app can be driven (`interfaces.json`) — usually a short, positive section.**
Explain, in one line each, the ways the product can be used: people through the web, developers through an API or toolkit, AI assistants through a direct connection (MCP), power users through the command line. This is often a genuine strength worth naming — an app that agents and partners can build on is more valuable than one only humans can click. But be honest about `status`: a connection that exists but only does two things is a *start*, not a feature — say so.

## Technology choices — the honest tradeoffs (don't be cheap on the cons)

The app made specific technology bets. The founder deserves to know what each bet *bought* and what it *costs* — in business terms, tied to their situation (early vs scaling, chasing enterprise deals or not, big team or two people). Present every significant choice as a genuine tradeoff with **both sides**. Never cheerlead a technology, and never trash one — but do not soften the disadvantages to sound positive. A report that only lists upsides is not honest and is not useful.

Rules:
- For each notable choice (framework, auth, hosting, database, key libraries): **what it buys** and **what it costs**, both in plain business terms, then a recommendation tied to *their* stage and goals — usually "keep it, here's what to watch" rather than "switch."
- Tie cons to consequences the founder feels: vendor bills, security/breach liability, hiring difficulty, how fast they can ship, enterprise-sales blockers, the risk of betting on something young.
- Distinguish "younger / smaller community" (a real, manageable risk) from "wrong choice" (rare). Most stack choices are defensible; the job is informed eyes-open, not alarm.
- **Verify before you disparage.** "Don't be cheap on the cons" means ACCURATE cons, not invented ones. Do NOT label a technology immature, niche, or feature-poor from vibes, its name, or its age — check its actual adoption, maturity, and feature set first. And separate an **inherent tradeoff of an approach** (e.g. self-hosting anything means you run and secure it) from a **deficiency of a specific tool** (often false — the tool may be mature and full-featured). Overstating cons is as dishonest as hiding them.

Two choices this app made, with honest both-sides framing (adapt to what the blueprint actually shows):

**Better Auth (self-hosted sign-in) — instead of a paid service like Auth0/Clerk.**
- *Buys you:* a mature, battle-tested, **framework-agnostic** library with a deep first-class plugin catalog — two-factor auth, multi-tenancy/organizations, multi-session, rate limiting, Stripe subscription billing, an admin panel, API keys for partners/automation, single-sign-on — plus a plugin system to add more without forking. You keep your users in your own database (single source of truth, no per-user bill that grows with success), with full control of the auth flows, and you can run it embedded in the app or as a standalone self-hosted auth server. So self-hosting here means neither giving up features nor rolling your own security.
- *Cleans up messy auth (often the biggest win):* adopting it consolidates the kind of hand-rolled, drifted auth that accumulates in an older codebase — several different ways of deciding who's an admin, a bespoke token table, a back-door test login, home-grown encryption — into **one coherent system**. If the blueprint shows a before (legacy, bespoke) and after (on Better Auth), point at it directly: the sprawl collapses into a single well-structured setup. A concrete reliability-and-security upgrade, not just a swap.
- *Costs you (the honest tradeoff — operational, not security-implementation):* the auth flows and security practices are handled by the library, so this is NOT "build secure auth from scratch." What self-hosting means is you **operate** it — hosting, upgrades, uptime, and incident response sit with your team, where a paid SaaS runs that for you and bundles hosted extras (bot/anomaly detection, leaked-password monitoring, vendor compliance certifications) you'd otherwise operate and document yourself. You trade a per-user bill and vendor ops for control, data ownership, and predictable cost.
- *Usually:* a strong default for an independent product — mature, full-featured, framework-agnostic, and frequently a genuine cleanup of inherited auth. The real question is who owns operating it, not whether the tool is good enough.

**TanStack Start (the web framework) — instead of the incumbent (Next.js).**
- *Buys you:* modern, tidy developer experience; strong type-safety that catches whole classes of bugs before users see them; fast iteration; fine-grained control; deploys well to modern/edge hosting. It's built on the TanStack ecosystem (Query, Router, Table) that is battle-tested and everywhere in React, and it's production-proven at real scale — the AI app builder Lovable runs on it to host thousands of products.
- *Costs you (the honest, modest tradeoff):* it's newer than the default incumbent (Next.js), which simply has the largest ecosystem — so there are fewer ready-made templates, third-party examples, and "batteries-included" niceties, and a smaller (though real and growing) pool of developers who've used *this specific* framework, which can make hiring slightly slower than for Next. That's a familiarity/ecosystem-size consideration, not a viability one.
- *Usually:* a solid, modern choice with genuine production pedigree; the main question is your team's familiarity and hiring plans versus the mainstream default — not whether the framework will be around.

## Delivery

Produce **both**:
1. A **markdown** report in the repo (e.g. `docs/reports/<app>-second-opinion.md`) — versioned, diffable.
2. A **shareable web page**: load the **artifact-design** skill, then render the same report as one clean, print-friendly, theme-aware page they can send to a cofounder or the agency. Same content, nicer to read.

## Red flags — you're writing the wrong report

| Symptom | Fix |
|---|---|
| A technical term with no translation | Rephrase as the effect on the user/business, or cut the term. |
| A problem with no "what it means for you" | Incomplete — add the business impact or delete it. |
| All problems, no credit | You'll lose the reader's trust. Name what's genuinely good. |
| A recommendation with no effort + payoff | Not decision-useful. Add both. |
| "Rewrite the app" | Almost always wrong. Separate rewire (cheap) from rebuild (dear); lean on what `migration.json.mappings` says survives. |
| A guess stated as fact | Mark confidence. "I'm certain" and "I'd need to check" are different sentences. |
| Only listed the upsides of a technology choice | Not honest. Every bet has a cost — name it in business terms, don't soften it to sound positive. |
| Trashed a technology as "the wrong choice" | Equally lazy. Most choices are defensible; frame as tradeoff + "what to watch," not a verdict. |
| "The frontend is just screens, it'll be quick" | Wrong. The custom-logic pieces (charts, complex tables, editors) are real work — flag them separately from the cheap standard pieces. |
| A design point with no "why it matters" | Taste, not advice. Tie every design finding to user perception (polish/trust) or maintenance cost (change-once vs hunt-everywhere), plus effort. |
| Reads like a code review | Wrong audience. Would a founder know what to *do* after this paragraph? |

## Relationship to pikku-software-archaeology

`pikku-software-archaeology` = facts → `.knowledge/` blueprint, for a machine to rebuild from. **This skill** = blueprint → opinionated report, for a human to decide from. One extracts; one advises. Run archaeology first (or point this skill at an existing `.knowledge/`), then translate its `gaps.json` + `invariants.json` + `migration.json` into the business-language report above.
