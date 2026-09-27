# What language you write in

Three different things in a Pikku project have a human language, and they are
**not** the same language. Collapsing them is the mistake this section exists to
prevent, and it has already shipped in a real product — the failure is at the
bottom.

| Axis            | What it covers                                                                                                                                                    | What decides it                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Identifiers** | Function, component, type, variable and file names. Database tables and columns. Branch names and commit messages.                                                | Nothing. **Always English.** There is no setting.                                                           |
| **Meta**        | The prose authored _inside_ the code: `description` on functions and steps, `name`/`title` on features and scenarios, step `template`, role/persona descriptions. | `metaLocale` in `pikku.config.json`. Defaults to `en`.                                                      |
| **Product UI**  | Every string the app shows a user.                                                                                                                                | `messages/<locale>.json`, with `active.json`'s `defaultLocale` choosing what a first-time visitor opens in. |

## Identifiers are English, and nothing changes that

Not the product's market, not the team's working language, and **not `metaLocale`**.
A German medical practice, an Arabic marketplace and a Japanese logistics tool
all get `getOverview`, `AttentionStripe`, `case`, `event`.

This is not linguistic preference, it is mechanics. Identifiers are the surface
every other tool binds to: the generated `#pikku/*` clients, `pikku info` and
`pikku meta`, the RPC map a scenario's `actor.invoke` is typed over, the
generated SQL types, every skill and every agent that ever picks the project up.
A `vorgang` table types as `Vorgang` in Kysely and reads as noise to everyone who
did not name it, and unlike a string it cannot be translated later — renaming an
identifier is a migration, not an edit.

## Meta follows `metaLocale`, and that is what the field is for

```json
{ "metaLocale": "de" }
```

Meta is the one part of a project the **Pikku Console** renders back to a human.
A team reviewing their own functions, features and scenario reports in the
Console is reading meta and nothing else, so a team whose working language is
German should be able to read their Console in German. That is the entire reason
the field exists.

Read it before you author meta, and write descriptions, titles and templates in
it. Absent, it is `en`. It is a BCP-47 tag (`en`, `de`, `pt-BR` — a hyphen, not
an underscore), and the CLI rejects anything else by name.

`metaLocale` is **not** licence to rename anything. `metaLocale: "de"` buys a German
`description: 'Zeigt die Arbeitsliste'` on a function still called
`getWorklist`.

## Product UI language lives in the catalogue, and only there

What the app says to its users is a translation concern, not a code concern. It
belongs in `messages/<locale>.json`; `pikku-i18n` owns the details. The one rule
worth repeating here: **`baseLocale` in `project.inlang/settings.json` stays
`en`.** It names the message _source_ — the catalogue every other language is
cloned from and translated against — so a project that sets it to anything else
has no English catalogue to translate from and can never gain a second language
without re-authoring every key.

## The failure this comes from

An agent was asked to build a doctor's portal for a German practice. The brief
said "the entire UI is German, no English strings visible anywhere". The agent
read one sentence about the product's users as an instruction about the
codebase, and produced:

- `project.inlang/settings.json` with `baseLocale: "de"` and `locales: ["de"]`,
  no `en.json` at all — which silently broke `--add-locale` forever
- RPC functions `getUebersicht` and `getPatientendetail`
- React components `Zeitstrahl` and `AufmerksamkeitStreifen`
- database tables `vorgang` and `ereignis`, with German columns

Every one of those is wrong, and the brief was satisfied by none of them: a
German UI needs German _messages_. What that project actually wanted was three
settings, each on its own axis:

```jsonc
// project.inlang/settings.json — the message source stays English
{ "baseLocale": "en", "locales": ["en", "de"] }

// apps/app/src/i18n/active.json — what a first-time visitor opens in
{ "defaultLocale": "de" }

// pikku.config.json — the language the team reads their Console in
{ "metaLocale": "de" }
```

Identifiers stay English throughout. When a brief tells you the product speaks a
language, it is telling you about axis three and nothing else.
