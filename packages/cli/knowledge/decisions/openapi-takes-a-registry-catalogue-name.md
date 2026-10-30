---
type: decision
title: A registry catalogue name installs an OpenAPI like a path or URL
description: pikku addons add <name> and pikku new addon --openapi <name> resolve a catalogue name through the registry's /registry/openapis/<name> and generate from the entry's swaggerUrl; addons add takes --auth from the entry, OAuth always per user; an empty answer is "no such API"
tags: cli, addons, openapi, registry
---

# A registry catalogue name installs an OpenAPI like a path or URL

The website's OpenAPI catalogue (`pikku.dev/openapis/<slug>`) lists every spec
the registry knows. Installing one into an app is
`pikku addons add amazonaws.com:applicationcostprofiler`; scaffolding the
package alone is `pikku new addon <name> --openapi <the same name>`. The CLI
asks `<registry>/registry/openapis/<name>` and hands the entry's
`swaggerUrl` to the generator, so nothing downstream knows the spec came from
the catalogue.

**Telling a name from a spec.** A URL, anything with a `/` or `\`, a file that
exists, and anything ending in `.json`/`.yaml`/`.yml` is a spec. The last rule
is there so a mistyped `spec.json` says "no such file" rather than "no such
API". Catalogue names (`stripe.com`, `provider:service`) carry none of these.

**Telling a name from an npm addon** (`addons add` only). Every catalogue name
starts with the provider's domain — all 2,500 entries checked — and addon
package names (`stripe`, `@pikku/addon-stripe`) carry no dot. So an unscoped
argument with a `.` or `:` is a catalogue name; anything else is a package.

**`--auth` comes from the entry** when `addons add` is not given one:
`authType: none` → `none`; `oauth2` or `perUser: true` → `user`; an
`api_key`/`bearer`/`basic` the app holds → `shared`; `unknown`, `custom` or
missing → `user`. OAuth is `user` even where the registry says `perUser: false`
(306 entries): one person's grant behind every user is never what is meant. A
path or URL still needs `--auth`, because nothing records the answer for it.

**The addon's name** is the catalogue name with `:` read as `.`, so the TLD is
dropped: `amazonaws.com:applicationcostprofiler` → `amazonaws-applicationcostprofiler`.

**An empty 200 is "not found".** The registry answers an unknown name with 200
and no body, not 404, so the CLI treats an entry without a `swaggerUrl` as
missing and refuses before writing anything.

**The registry** is `--registry`, else `pikku.config.json`'s `registry`, else
`https://api.pikkustudio.app` — the same default as remote addons.

**What this rules out:** accepting the website's slug
(`amazonaws-com-applicationcostprofiler`) — it drops the `.`/`:`, so it does not
map back to one name — and an npm addon package whose unscoped name contains a
dot, which `addons add` would now look up in the catalogue instead.
