---
'@pikku/addon-console': patch
'@pikku/inspector': patch
'@pikku/console': patch
'@pikku/core': patch
'@pikku/cli': patch
---

Redesign the console's scenarios screen as living documentation of a project's BDD features.

The inspector now statically extracts `pikkuFeature` declarations — name, description, tags, the scenarios each one groups (including `{ scenario, data }` examples), and whether it declares `before`/`after` — and the CLI writes them to `<outDir>/scenarios/features.gen.json`, which `MetaService.getFeaturesMeta()` reads and the console addon returns from `getAllMeta`.

The scenarios page reads that back as a document: features on the left, and on the right the selected feature's scenarios, each rendered as the given/when/then ladder of prose its author actually wrote, with repeats shown as `for each x in xs`, `Examples:` tables for parameterised entries, skip reasons stated rather than hidden, and each scenario's cast of personas inline. The Flows/Personas segmented control is gone; tags filter the document the same way `pikku scenario run --tags` filters a run.
