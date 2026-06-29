---
'@pikku/cli': patch
---

docs(skills): trim always-loaded skill context by splitting bulky reference material on demand

The `skill` tool injects the whole `SKILL.md` into the agent's context on every
load, so large rarely-needed reference blocks were paid for on every invocation.
Carved the nine heaviest skills: kept the Agent Operating Procedure, decision
rules, common-path guidance and one canonical example inline; moved exhaustive
option tables, full API/manifest references, and off-common-path recipes into
`references/*.md` that the agent reads on demand, each linked by an explicit
pointer line so no knowledge becomes invisible. Net knowledge loss is zero —
only location and verbosity changed.

- pikku-testing 636→328 (cucumber/BDD reference split out)
- pikku-workflow 334→168 (also reconciled a substantial drift between the OSS
  and bundled copies — merged the union of unique facts before deduping)
- pikku-services 293→210, pikku-http 318→226, pikku-addon 331→238,
  pikku-middleware 283→226, pikku-realtime 286→236, pikku-cli 281→195,
  pikku-concepts 286→229 (wired the previously-dead `concept-mapping.md`)

Also makes Zod the only *documented* function form: the generic
`pikkuFunc<In,Out>` overload still exists in code but is dropped from the
generated function-type JSDoc and the concept skills, so generated scaffolds and
docs show only the `input:`/`output:` Zod-schema form.
