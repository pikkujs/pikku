---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

`pikku scenario guide` writes the user guide a scenario suite already contains. A feature reads as a page, a scenario as a section, a step as a sentence somebody wrote in English, and a run leaves screenshots behind with the captions their author took them under — the command joins that to the editorial prose a project checks in under `docs/` and writes markdown. It renders no HTML, ships no components, resolves no asset URLs and calls no model: an image is an ordinary relative `![caption](path)`, and whoever consumes the markdown rewrites the paths.

An editorial source declares which features it covers, and nothing declares where a feature is documented — the mapping is many-to-many and falls out of the union of those lists:

```yaml
---
title: Deployments
features:
  - id: deploymentsFeature
    evidence: '3f2a91c'
---
```

`evidence` is a hash of that feature's step sentences and artifact ids, deliberately not of the image bytes: restyling a UI changes every screenshot and no sentence, while inserting or renaming a step changes what the prose was describing. A page written against an older hash is reported as stale.

Every registered feature has to be cited by some page, and a feature that is pure plumbing says so rather than being written about — `pikkuFeature({ document: false })`, threaded through the inspector and `FeatureMeta`. An uncited feature fails the command by name; `--allow-undocumented` downgrades that one failure to a report. A page citing a feature id that is not registered stays an error either way.

Generated blocks are delimited by `<!-- pikku:guide feature=<id> evidence=<hash> -->` … `<!-- /pikku:guide -->`, so a rebuild rewrites exactly those regions and every sentence a human wrote around them survives. Emission is deterministic — identical inputs give byte-identical output, and no timestamp goes in that did not come from the run record.
