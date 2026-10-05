# Console backlog

Branch `fullstack-pikku`, live at http://localhost:4177/console/. Page-by-page review in progress.

## Page review

### Hero ("what is this page") — audit 2026-10-02

A hero is `SectionCard hero` (renders the page's h1 + blurb). Checked every static route on the live e2e console.

Has a hero:
addons, agents, artifacts, async/queue, auth-providers, credentials, emails, knowledge, overview, pages, personas, roles, runtime, scopes (Permissions), scorers, virtual-users, wires/gateway, workflow

Missing a hero — card without `hero`, so it reads as a section, not a page intro:
- [ ] functions — "What your app can do" card
- [ ] flags — "Your switches"
- [ ] users — "People using your app"
- [ ] webhooks — "What your app sends"
- [ ] wires/mcp — "Connect an assistant" comes first; no page intro
- [ ] wires/channel — first card is a channel ("Release cli")
- [ ] wires/cli — first card is a command ("release")
- [ ] scenarios — first card is a scenario

Missing a hero — no card at all:
- [ ] analytics
- [ ] async/scheduler
- [ ] async/trigger
- [ ] audit
- [ ] changes
- [ ] checks
- [ ] config
- [ ] database
- [ ] secrets
- [ ] security
- [ ] surface
- [ ] translations
- [ ] variables
- [ ] wires/http
- code: deliberately none, it mirrors fabric's editor

### Per page

- [ ] sidebar panels differ: agents playground (conversation list), addons (Browse list), virtual users, scenarios (carded list). Discuss before changing.
- [ ] checks: new page (254449d2d), in the nav, reads as part of Overview. Decide whether it is its own page or an Overview section.

- [ ] wires/mcp: the "Connect an assistant" card should be expandable (collapsible) — it fills the first screen with setup JSON; the actions list is what you come back for.
- [ ] scopes (Permissions): addon cards read "@pikku/addon-admin from @pikku/addon-admin" when there is no displayName — show the package once.
- [ ] scopes (Permissions): header band has a hairline under it, Functions does not — pick one.
- [x] secrets + variables: card page in fabric's concept: hero with set/total, then Needs a value / Optional / Set groups, and a row opens the existing side panel. `ConfigValuesCards`, status via `console:secretHas` / `pikkuConsoleGetVariable`.
- [ ] secrets/variables side panel is still the old detail view (SECRET ID, "No schema", "Retrieve secret value"); make it the edit form fabric's drawer is.
- [ ] e2e: `emailsCredentials` and `emailsPromoCredentials` both resolve to secretId `EMAILS_PROMO_CREDENTIALS`, so "Emails API" shows the promo key. The emails addon instance doesn't namespace its secret.
- [x] security, no report yet: hero ("not checked yet"), "What the check looks at" card, For developers with `pikku audit --outdated`.
- [ ] security, with a report: still the old dense list (mono summary line, 50+ rows). Needs a hero verdict and grouping, like Checks.
- [x] translations: hero (languages + to-translate count), Languages card with progress per language, Wording in <language> card, remove asks inline first, sync moved under For developers. It now counts keys missing from the file, not only `%i18n-missing%`, so ar/de/zh show ~1657 untranslated where the old badge said "All translated".
- [x] emails right panel: "Try it out" with plain labels, sample values filled in, live preview (400ms), reset; hash and badges gone.
- [ ] webhooks: blanks once there are 2+ deliveries — `WebhooksCards.tsx:86` sorts `createdAt.localeCompare` but the API returns a Date. Fix where deliveries are serialised. Pre-existing, not this branch.

## Search and filters in the header (sweep, half done)

Rule: page-wide search/filters live in the header (`ListPageHeader` `search` / `headerFilters` / `actions`); a control for one panel or card stays with it.
Done: Permissions, Functions, Secrets, Variables, Emails, Database.
- [ ] Credentials — app / me / customers SegmentedControl in a card → header `selection`
- [ ] AuditLogPanel — `headerRight` control
- [ ] CommunityGallery — search in the body
Stay put: Emails language/view switch (per preview), RunsPanel status switch (per panel).

## Infrastructure

- [ ] Theme in dev reads `@pikku/mantine/theme` from dist; a stale build turns the console black. Proposed: `development` export condition in `@pikku/mantine` package.json (fabric consumes it too). Not decided.
- [ ] Translate new en-only copy (scopes_*, functions_filter_*, database_*) into de / ar / zh.
- [ ] 3 console tests fail: /a/:id, /code, /pages, /translations, /artifacts have no help or nav entry.
- [ ] Code page: hover / go-to-definition still from the browser's TS (can't see imports) — move to the server like diagnostics.
- [ ] e2e/packages/web has no tsconfig; `#pikku/*` is a vite alias TS can't see. Add a tsconfig with `paths`.

## Decisions before the PR

- [ ] Scenarios on Functions: remove, or keep behind Built-in?
- [ ] Move the built-in-function rule into core?
- [ ] Knowledge on the browse cards (changes fabric's page)?
- [ ] Drop the remaining console theme tweaks?
- [ ] One PR or stacked PRs?
- [ ] Push `fullstack-pikku` / open the PR. AGENTS.md checklist: verifier, e2e, docs, knowledge, changesets (patch).
