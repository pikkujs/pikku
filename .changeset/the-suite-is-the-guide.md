---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

`pikku scenario guide` writes the user guide a scenario suite already contains. A feature reads as a page and a scenario as a section, and a run leaves screenshots behind with the captions their author took them under — the command joins that to the editorial prose a project checks in under `docs/` and writes markdown. It renders no HTML, ships no components, resolves no asset URLs and calls no model: an image is an ordinary relative `![caption](path)`, and whoever consumes the markdown rewrites the paths.

A page cites a feature by leaving the marker pair where the block belongs:

```markdown
---
title: Deployments
---

A deployment is one tracked shipment of your app.

<!-- pikku:guide feature=deploymentsFeature -->
<!-- /pikku:guide -->

## Does my app go down during a deploy?
```

That one line does both halves of the job. It says *where* the block goes, which a frontmatter list cannot express, and it is what the coverage gate counts to decide *whether* a feature is documented at all. The mapping stays many-to-many and falls out of the union of every marker in the tree. A rebuild rewrites exactly the regions between the markers, so every sentence a human wrote around them survives.

**The steps are evidence, not content.** A generated block is the scenario's title, the description its author wrote, and the shots it filed — never a numbered Given/When/Then ladder, which is a test report and not something anybody arrives at a documentation page wanting. The sentences are still what the guide is kept honest against: `docs/.guide.lock` records a hash of each feature's step sentences and artifact ids, deliberately not of the image bytes. Restyling a UI changes every screenshot and no sentence; inserting or renaming a step changes what the prose was describing, and the page is reported stale. The lock is generated and checked in, so no hash is ever typed or merged by hand — and a tree whose lock is untracked reports every page as current forever.

Every registered feature has to be cited by some page, and a feature that is pure plumbing says so rather than being written about — `pikkuFeature({ document: false })`, threaded through the inspector and `FeatureMeta`. An uncited feature fails the command by name; `--allow-undocumented` downgrades that one failure to a report. A page citing a feature id that is not registered stays an error either way.

A guide is only written out of a run that can stand behind it. A run that failed or was killed halfway is refused, because a page is a claim that the product does what it says. So is a narrowed one: `pikku scenario run --flows`/`--features`/`--tags` leaves out scenarios the suite has, and a guide built from it would describe those flows as though they do not exist. `ScenarioRunRecord.selection` records the filters a run was selected with, since nothing in the results afterwards can tell a suite of forty from forty that were asked for.

Results are joined to features by `featureId`, falling back to the display name only for records written before that field existed — a title is rewritten freely and two features may share one.

Emission is deterministic — identical inputs give byte-identical output, and no timestamp goes in that did not come from the run record. Frontmatter the compiler does not own (`slug`, `draft`, `sidebar_position`, anything else a docs site reads) passes through untouched, and a source written with CRLF line endings is read as having frontmatter.
