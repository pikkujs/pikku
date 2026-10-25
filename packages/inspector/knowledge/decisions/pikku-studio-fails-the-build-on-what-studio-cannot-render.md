---
type: decision
title: definePlugin fails the build on a duplicate path, a title missing from en.json, or a badge naming no function
description: validatePikkuStudio reports PKU357 for a path used twice, PKU358 for a title key missing from messages/en.json and PKU359 for a nav badge that names no function of the addon; a key missing from another locale is only a warning
tags: [inspector, screens, studio, addon]
---

# definePlugin fails the build on a duplicate path, a title missing from en.json, or a badge naming no function

`definePlugin` replaces `defineScreens` outright: there is no alias, and the
inspector only recognises a call to `definePlugin`.

- A path used by two screens of the same addon is
  `STUDIO_SCREEN_PATH_DUPLICATE` (PKU357), reported by `addPikkuStudio`
  (`packages/inspector/src/add/add-pikku-studio.ts:278`).
- `validatePikkuStudio` (run from `inspector.ts:213`, after every file is
  visited) finds the addon's package root as the nearest `package.json` above
  the file that calls `definePlugin` (`packageRoot`, line 294). A manifest or
  screen title missing from `messages/en.json` there is
  `STUDIO_MESSAGE_KEY_MISSING` (PKU358, line 331); missing from any other
  `messages/{locale}.json` it is a warning (line 344).
- A `nav.badge` that names no function in `state.functions.meta` is
  `STUDIO_BADGE_FUNCTION_NOT_FOUND` (PKU359, line 356).
- A screen's `agent` of the form `studio:<name>` names an agent Studio ships;
  only its format (`/^studio:[a-z][a-z0-9-]*$/`) is checked, with no file lookup
  and no `agentTitle`/`agentDescription`.
- Any other `agent` is checked in the same pass: a name outside
  `/^[a-z][a-z0-9-]*$/`, a missing or blank `agents/<name>.md`, or a file
  without frontmatter `title` and `description` is
  `STUDIO_SCREEN_AGENT_INVALID` (PKU365). Those two frontmatter values are
  message keys, so one missing from `messages/en.json` is PKU358. A valid agent
  gets `agentTitle` and `agentDescription` written onto its screen in
  `state.studio`, so Studio reads them from the generated meta.

The Go inspector runs the same check (`ValidatePikkuStudio` in
`internal/visit/group_pikku_studio.go`, called from `internal/analyze/analyze.go`).
`verifiers/pikku-studio` builds a valid addon and then breaks it once per code.

**What this rules out:** shipping an addon whose screen titles Studio cannot
translate, whose badge calls nothing, or whose two screens claim one route.
